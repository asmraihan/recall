import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { learningSessions, sessionWords, words, learningProgress } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  req: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const { sessionId } = await context.params;
    // Fetch the session
    const [learningSession] = await db
      .select()
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

    // Fetch the words for this session
    const sessionWordRows = await db
      .select({ wordId: sessionWords.wordId, presentationOrder: sessionWords.presentationOrder, isCorrect: sessionWords.isCorrect, answeredAt: sessionWords.answeredAt })
      .from(sessionWords)
      .where(eq(sessionWords.sessionId, sessionId));
    const wordIds = sessionWordRows.map((row) => row.wordId);
    if (!wordIds.length) {
      return NextResponse.json({ error: "No new words in this section." }, { status: 400 });
    }
    // Fetch word details and preserve order, use important from words table
    const wordDetails = await db
      .select({
        id: words.id,
        mainWord: words.mainWord,
        translation1: words.translation1,
        translation2: words.translation2,
        exampleSentence: words.exampleSentence,
        notes: words.notes,
        section: words.section,
        important: words.important,
      })
      .from(words)
      .where(and(eq(words.createdBy, auth.userId), eqAny(words.id, wordIds)));
    // Sort words by presentationOrder and merge answer state
    const wordOrderMap = Object.fromEntries(sessionWordRows.map((row) => [row.wordId, row.presentationOrder]));
    const answerMap = Object.fromEntries(sessionWordRows.map((row) => [row.wordId, { isCorrect: row.isCorrect, answeredAt: row.answeredAt }]));
    const sortedWords = wordDetails
      .map(w => ({ ...w, ...answerMap[w.id] }))
      .sort((a, b) => (wordOrderMap[a.id] || 0) - (wordOrderMap[b.id] || 0));

    return NextResponse.json({ session: learningSession, words: sortedWords });
  } catch (error) {
    console.error("[LEARN_SESSION_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

// Helper for eqAny (inArray)
import { inArray } from "drizzle-orm";
const eqAny = inArray;
/**
 * Removes one session from history.
 *
 * Deliberately does NOT touch `learning_progress`. Spaced-repetition state is
 * cumulative across every session a word has ever appeared in, so there is no
 * "the part this session contributed" to subtract — reverting it would mean
 * discarding review history the user never asked to lose. Deleting a session
 * removes the record of the sitting, not what was learned in it.
 *
 * `neon-http` has no transactions, so the child rows go first: a failure
 * between the two statements leaves a session with no words, which still
 * renders, rather than orphaned rows pointing at a session that is gone.
 */
export async function DELETE(
  req: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const { sessionId } = await context.params;

    // Ownership is checked before anything is deleted, and the check is part
    // of the same query rather than a separate read — another user's session
    // id must be indistinguishable from one that does not exist.
    const [owned] = await db
      .select({ id: learningSessions.id })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.userId, auth.userId)
        )
      );
    if (!owned) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await db.delete(sessionWords).where(eq(sessionWords.sessionId, sessionId));
    await db.delete(learningSessions).where(eq(learningSessions.id, sessionId));

    return NextResponse.json({ deleted: sessionId });
  } catch (error) {
    console.error("[LEARN_SESSION_DELETE]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
