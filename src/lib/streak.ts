/**
 * Consecutive distinct days with a completed session, anchored on today or
 * yesterday. Mirrors the calculation in /api/learn/stats exactly, including
 * its "look back at most 30 sessions" input limit.
 */
export function computeStreak(completedAt: (Date | null)[]) {
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  const counted = new Set<number>();

  for (const raw of completedAt) {
    if (!raw) continue;
    const day = new Date(raw);
    day.setHours(0, 0, 0, 0);
    const time = day.getTime();
    if (counted.has(time)) continue;
    counted.add(time);

    if (time === cursor.getTime() || time === cursor.getTime() - 86400000) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
