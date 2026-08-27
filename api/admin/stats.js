/**
 * Owner-only usage figures.
 *
 * WHY THIS IS A SERVER ENDPOINT
 * -----------------------------
 * Counting users means reading /users, and the security rules correctly stop
 * any client from doing that — a student can only read their own subtree, which
 * is exactly right and must stay that way. Aggregating therefore has to happen
 * somewhere holding the service account, which means here.
 *
 * WHAT IT DELIBERATELY DOES NOT RETURN
 * ------------------------------------
 * Counts and dates only. No email addresses, no class names, no assignment
 * titles, no uids. A stats page needs to know that eleven people enabled
 * notifications; it does not need to know which eleven, and building it so it
 * *could* say would make one bug the difference between a dashboard and a
 * leak. The leaderboard is the single exception, and only because those display
 * names are already public by design.
 */
import { dbGet, verifyCaller } from "../_lib/firebase.js";
import { SYLLABUS_QUOTA } from "../_lib/quota.js";

function fail(res, status, code, message) {
  return res.status(status).json({ ok: false, code, error: message });
}

/** Buckets ISO timestamps into the last `days` days, oldest first. */
function daily(timestamps, days = 30, now = new Date()) {
  const out = [];
  const dayMs = 86400000;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    const start = todayUtc - i * dayMs;
    out.push({ date: new Date(start).toISOString().slice(0, 10), count: 0 });
  }
  const index = new Map(out.map((row, i) => [row.date, i]));
  for (const t of timestamps) {
    const day = String(t).slice(0, 10);
    const i = index.get(day);
    if (i !== undefined) out[i].count++;
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return fail(res, 405, "METHOD_NOT_ALLOWED", "Use GET.");
  }

  // ---------------------------------------------------------------
  // 1. Only the owner. Checked against a verified token claim, never
  //    against anything the client sends in the body.
  // ---------------------------------------------------------------
  let caller;
  try {
    caller = await verifyCaller(req.headers.authorization, { withClaims: true });
  } catch (error) {
    console.error("[admin/stats] auth unavailable", {
      detail: error instanceof Error ? error.message : String(error),
    });
    return fail(res, 503, "AUTH_UNAVAILABLE", "Stats are unavailable right now.");
  }

  if (!caller) {
    return fail(res, 401, "UNAUTHENTICATED", "Sign in first.");
  }

  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!adminEmail) {
    console.error("[admin/stats] ADMIN_EMAIL is not set on this deployment");
    return fail(
      res,
      503,
      "ADMIN_NOT_CONFIGURED",
      "Stats aren't set up yet. (Owner: set ADMIN_EMAIL in Vercel and redeploy.)"
    );
  }

  // email_verified matters: Firebase lets an account exist with an unverified
  // address, so matching on the address alone would let anyone who typed the
  // owner's email at signup read this.
  const callerEmail = String(caller.email || "").trim().toLowerCase();
  if (callerEmail !== adminEmail || caller.emailVerified === false) {
    // 404, not 403. A 403 confirms the endpoint exists and that they guessed a
    // real admin route; there is no reason to tell them that.
    return fail(res, 404, "NOT_FOUND", "Not found.");
  }

  // ---------------------------------------------------------------
  // 2. Read and count.
  // ---------------------------------------------------------------
  try {
    const [users, quota, boards] = await Promise.all([
      dbGet("users"),
      dbGet("syllabusQuota"),
      dbGet("leaderboards"),
    ]);

    const userMap = users.value || {};
    const uids = Object.keys(userMap);

    let classCount = 0;
    let assignmentCount = 0;
    let testCount = 0;
    let syllabiAttached = 0;
    let usersWithAnyClass = 0;
    const installs = [];
    const notifications = [];
    const timezones = {};

    for (const uid of uids) {
      const record = userMap[uid] || {};
      const classes = Array.isArray(record.classes) ? record.classes : [];
      if (classes.length) usersWithAnyClass++;
      classCount += classes.length;

      for (const cls of classes) {
        assignmentCount += Array.isArray(cls.assignments) ? cls.assignments.length : 0;
        testCount += Array.isArray(cls.tests) ? cls.tests.length : 0;
        if (cls.syllabus && cls.syllabus.status === "ready") syllabiAttached++;
      }

      const milestones = record.milestones || {};
      if (milestones.installed) installs.push(milestones.installed);
      if (milestones.notificationsEnabled) notifications.push(milestones.notificationsEnabled);

      if (record.timezone) timezones[record.timezone] = (timezones[record.timezone] || 0) + 1;
    }

    // Every syllabus parse ever attempted, with its timestamp. Built as a spend
    // limit; it doubles as the usage log for the feature.
    const quotaMap = quota.value || {};
    const parseTimestamps = [];
    let usersWhoParsed = 0;
    for (const uid of Object.keys(quotaMap)) {
      const attempts = (quotaMap[uid] || {}).attempts;
      if (Array.isArray(attempts) && attempts.length) {
        usersWhoParsed++;
        parseTimestamps.push(...attempts);
      }
    }

    const boardMap = boards.value || {};
    const leaderboards = Object.keys(boardMap).map((game) => {
      const rows = Object.values(boardMap[game] || {});
      const timeBased = game === "oddEmoji" || game === "reaction";
      const sorted = rows
        .filter((r) => r && typeof r.score === "number")
        .sort((a, b) => (timeBased ? a.score - b.score : b.score - a.score));
      return {
        game,
        players: rows.length,
        top: sorted.slice(0, 5).map((r) => ({
          // Already public: leaderboards/$gameType is ".read": true.
          name: String(r.username || "").slice(0, 20),
          score: r.score,
        })),
      };
    });

    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      accounts: {
        total: uids.length,
        withAtLeastOneClass: usersWithAnyClass,
      },
      content: {
        classes: classCount,
        assignments: assignmentCount,
        tests: testCount,
        syllabiAttached,
      },
      syllabus: {
        totalParses: parseTimestamps.length,
        usersWhoParsed,
        perDay: daily(parseTimestamps, 30),
        monthlyLimitPerUser: SYLLABUS_QUOTA.limit,
      },
      installs: {
        total: installs.length,
        perDay: daily(installs, 30),
      },
      notifications: {
        total: notifications.length,
      },
      timezones,
      leaderboards,
    });
  } catch (error) {
    console.error("[admin/stats] read failed", {
      detail: error instanceof Error ? error.message : String(error),
    });
    return fail(res, 502, "DB_ERROR", "Couldn't read the numbers just now.");
  }
}
