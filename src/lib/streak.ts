const DAY_MS = 86400000;

/** Account learning days use UTC, matching persisted server timestamps. */
export function streakSummary(completedAt: (Date | null)[], now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = new Set(completedAt.filter((date): date is Date => date !== null && Number.isFinite(date.getTime()))
    .map((date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())));
  let cursor = days.has(today) ? today : today - DAY_MS;
  const lastDay = cursor;
  let streak = 0;
  while (days.has(cursor)) { streak++; cursor -= DAY_MS; }
  return {
    streak,
    // After a session today, tomorrow is the next day that must be completed.
    streakResetsAt: streak > 0 ? lastDay + 2 * DAY_MS : null,
    dayEndsAt: today + DAY_MS,
    todayStart: today,
  };
}

export function computeStreak(completedAt: (Date | null)[], now = new Date()) {
  return streakSummary(completedAt, now).streak;
}
