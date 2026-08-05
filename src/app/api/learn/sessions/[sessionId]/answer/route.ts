import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { learningProgress, sessionWords, learningSessions } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { nextState } from "@/lib/spaced-repetition";

export async function POST(req: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json();
    const wordId: string = body?.wordId;
    const isCorrect: boolean = body?.isCorrect;
    if (!wordId || typeof isCorrect !== "boolean") {
      return new NextResponse("Missing wordId or isCorrect", { status: 400 });
    }

    // Fetch the session to get the direction. Scoping to the caller is what
    // stops anyone posting answers into someone else's session and corrupting
    // their learning_progress.
    const [learningSession] = await db
      .select({ direction: learningSessions.direction })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.userId, auth.userId)
        )
      );
    if (!learningSession) {
      return new NextResponse("Session not found", { status: 404 });
    }
    // Use generic default direction (main_to_trans1) instead of hardcoded language
    const preferredDirection = learningSession.direction || "main_to_trans1";

    // Get or create learning_progress row
    const [progress] = await db
      .select()
      .from(learningProgress)
      .where(and(eq(learningProgress.userId, auth.userId), eq(learningProgress.wordId, wordId)));
    // The schedule now lives in one place so /api/mobile/answers can't drift
    // from it. Behaviour is byte-for-byte what this handler did inline.
    const { masteryLevel, correctAttempts, incorrectAttempts, nextReviewDate } =
      nextState(progress ?? null, isCorrect);

    if (progress) {
      await db.update(learningProgress)
        .set({
          masteryLevel,
          correctAttempts,
          incorrectAttempts,
          lastReviewedAt: new Date(),
          nextReviewDate,
        })
        .where(eq(learningProgress.id, progress.id));
    } else {
      await db.insert(learningProgress).values({
        userId: auth.userId,
        wordId,
        masteryLevel,
        correctAttempts,
        incorrectAttempts,
        lastReviewedAt: new Date(),
        nextReviewDate,
        preferredDirection,
      });
    }

    // Update session_words
    await db.update(sessionWords)
      .set({
        isCorrect,
        answeredAt: new Date(),
      })
      .where(and(eq(sessionWords.sessionId, sessionId), eq(sessionWords.wordId, wordId)));

    // Check if all words are answered
    const unanswered = await db
      .select()
      .from(sessionWords)
      .where(and(eq(sessionWords.sessionId, sessionId), isNull(sessionWords.answeredAt)));
    if (unanswered.length === 0) {
      // Mark session as completed
      const correctCount = await db
        .select()
        .from(sessionWords)
        .where(and(eq(sessionWords.sessionId, sessionId), eq(sessionWords.isCorrect, true)));
      const incorrectCount = await db
        .select()
        .from(sessionWords)
        .where(and(eq(sessionWords.sessionId, sessionId), eq(sessionWords.isCorrect, false)));
      await db.update(learningSessions)
        .set({
          status: "completed",
          completedAt: new Date(),
          correctAnswers: correctCount.length,
          incorrectAnswers: incorrectCount.length,
        })
        .where(eq(learningSessions.id, sessionId));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[LEARN_SESSION_ANSWER_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}