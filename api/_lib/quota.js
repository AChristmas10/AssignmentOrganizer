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
 * Reads the user's attempt list, claims a slot, and writes it back — in a
 * transaction, so two parses fired at once cannot both see nine used and both
 * proceed.
 *
 * Claims the slot BEFORE the Anthropic call, never after. If it were written on
 * completion, a request killed by the function timeout would never be counted,
 * and repeated timeouts would be unlimited and free.
 *
 * Returns { ok: true } or { ok: false, state } so the caller can explain.
 */
export async function claimQuotaSlot(db, uid, now = new Date()) {
  const ref = db.ref(`syllabusQuota/${uid}/attempts`);
  let observed = null;

  const result = await ref.transaction((current) => {
    const state = quotaState(Array.isArray(current) ? current : [], now);
    observed = state;
    // Returning undefined aborts the transaction. Returning `current` would
    // COMMIT a no-op, and committed:true is how the caller knows a slot was
    // claimed — so the difference between these two lines is the difference
    // between a working limit and no limit at all.
    if (state.exhausted) return undefined;
    return [...state.inWindowIso, now.toISOString()];
  });

  if (!result.committed || (observed && observed.exhausted)) {
    return { ok: false, state: observed || quotaState([], now) };
  }
  return { ok: true, state: observed };
}
