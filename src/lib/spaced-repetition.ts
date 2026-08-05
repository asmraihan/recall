/**
 * The spaced-repetition schedule, extracted verbatim from
 * `api/learn/sessions/[sessionId]/answer/route.ts` so a single copy exists.
 *
 * This is an EXTRACTION, not a fix. Its known quirks are preserved on purpose:
 *  - the correct-ratio is computed from PRE-update counts
 *  - `masteryLevel` can reach INTERVALS.length (6), where INTERVALS[6] is
 *    undefined and falls back to 60 days
 *  - advancement requires a LIFETIME correct-ratio >= 0.7, so a word with a
 *    bad early history can stall
 *
 * That last one is a real defect (docs/FEATURES.md §3.1). Fixing it changes
 * every user's schedule and belongs in its own change.
 */
export const INTERVALS = [1, 3, 7, 14, 30, 60]; // days

export type SRState = {
  masteryLevel: number;
  correctAttempts: number;
  incorrectAttempts: number;
};

export function nextState(prev: SRState | null, isCorrect: boolean) {
  let masteryLevel = prev?.masteryLevel ?? 0;
  let correctAttempts = prev?.correctAttempts ?? 0;
  let incorrectAttempts = prev?.incorrectAttempts ?? 0;

  if (isCorrect) {
    if (correctAttempts === 0 && incorrectAttempts === 0) {
      masteryLevel = 1;
    } else {
      const total = correctAttempts + incorrectAttempts;
      if (correctAttempts / total >= 0.7) {
        masteryLevel = Math.min(masteryLevel + 1, INTERVALS.length);
      }
    }
    correctAttempts++;
  } else {
    masteryLevel = Math.max(masteryLevel - 1, 0);
    incorrectAttempts++;
  }

  const days = INTERVALS[masteryLevel] || INTERVALS[INTERVALS.length - 1];
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + days);

  return { masteryLevel, correctAttempts, incorrectAttempts, nextReviewDate };
}
