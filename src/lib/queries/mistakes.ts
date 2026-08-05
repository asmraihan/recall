import { sql } from 'drizzle-orm';
import { learningProgress } from '@/lib/db/schema';

/**
 * The "needs practice" predicate, extracted so the `mistakes` session type,
 * the `?filter=mistakes` word list, and the widget batch route all agree.
 *
 * Low mastery AND (more wrong than right OR a sub-70% lifetime ratio).
 */
export const mistakesPredicate = sql`(
  ${learningProgress.masteryLevel} < 3
  AND (
    ${learningProgress.incorrectAttempts} > ${learningProgress.correctAttempts}
    OR (
      ${learningProgress.correctAttempts} + ${learningProgress.incorrectAttempts} > 0
      AND CAST(${learningProgress.correctAttempts} AS FLOAT) /
      (${learningProgress.correctAttempts} + ${learningProgress.incorrectAttempts}) < 0.7
    )
  )
)`;

/** Same rule, applied in JS to already-fetched progress rows. */
export function isMistake(p: {
  masteryLevel: number;
  correctAttempts: number;
  incorrectAttempts: number;
}) {
  const total = p.correctAttempts + p.incorrectAttempts;
  return (
    p.masteryLevel < 3 &&
    (p.incorrectAttempts > p.correctAttempts ||
      (total > 0 && p.correctAttempts / total < 0.7))
  );
}
