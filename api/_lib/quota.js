import { dbGet, dbPut } from "./firebase.js";

/**
 * How many syllabus reads a student gets, and how that is counted.
 *
 * Parsing is the only action in Do2Date with a per-request cost, so it is the
 * only one that needs metering — and the only one worth putting behind a paid
 * tier later. A pro plan is this same calculation with a different limit.
 */
export const SYLLABUS_QUOTA = {
  /** Rolling window, not a calendar month: simpler, and no month-boundary rush. */
  windowDays: 30,
  limit: 10,
};

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure. Takes the timestamps of a user's past attempts and reports where they
 * stand, so the endpoint's guard and any UI display agree by construction
 * rather than by both reimplementing the arithmetic.
 *
 * Timestamps outside the window are ignored rather than assumed absent — the
 * caller may hand over more than it needs to.
 */
export function quotaState(attemptTimestamps, now = new Date(), limit = SYLLABUS_QUOTA.limit) {
  const windowMs = SYLLABUS_QUOTA.windowDays * DAY_MS;
  const cutoff = now.getTime() - windowMs;

  const inWindow = (attemptTimestamps || [])
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t) && t > cutoff)
    .sort((a, b) => a - b);

  const used = inWindow.length;
  const remaining = Math.max(0, limit - used);

  return {
    used,
    limit,
    remaining,
    exhausted: remaining === 0,
    resetsAt: inWindow.length > 0 ? new Date(inWindow[0] + windowMs) : null,
    /** Kept so the caller can write back a pruned list instead of an unbounded one. */
    inWindowIso: inWindow.map((t) => new Date(t).toISOString()),
  };
}

/**
 * Read the user's attempt list, claim a slot, write it back — with a
 * compare-and-swap so two parses fired at once cannot both see nine used.
 *
 * The Realtime Database REST API has no transactions, so this uses the ETag
 * the read returns and refuses the write if anything changed underneath. One
 * retry is enough: the loser of a race re-reads the winner's list and either
 * finds room or correctly reports exhausted.
 *
 * Claims the slot BEFORE the model call, never after. If it were written on
 * completion, a request killed by the function timeout would never be counted,
 * and repeated timeouts would be unlimited and free.
 *
 * Returns { ok: true, state } or { ok: false, state }.
 */
export async function claimQuotaSlot(uid, now = new Date()) {
  const path = `syllabusQuota/${uid}/attempts`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const { value, etag } = await dbGet(path);
    const state = quotaState(Array.isArray(value) ? value : [], now);

    if (state.exhausted) return { ok: false, state };

    const written = await dbPut(
      path,
      [...state.inWindowIso, now.toISOString()],
      etag
    );
    if (written) return { ok: true, state };
    // 412: someone else claimed a slot between our read and write. Loop.
  }

  // Two consecutive losses means genuine contention on one account. Refusing
  // is the safe answer — the alternative is writing without a guard.
  const { value } = await dbGet(path);
  return { ok: false, state: quotaState(Array.isArray(value) ? value : [], now) };
}
