import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { learningProgress, words } from "@/lib/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";

// GET /api/learn/due-words - Get words due for review
export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    // Find word IDs due for review
    const dueWordIds = await db
      .select({ wordId: learningProgress.wordId })
      .from(learningProgress)
      .where(
        and(
          eq(learningProgress.userId, auth.userId),
          sql`${learningProgress.nextReviewDate} <= NOW()`
        )
      );

    const dueIdsArray = dueWordIds.map(w => w.wordId);

    if (!dueIdsArray.length) {
      return NextResponse.json([]);
    }

    // Get word details
    const wordsDue = await db
      .select({
        id: words.id,
        mainWord: words.mainWord,
        translation1: words.translation1,
        translation2: words.translation2,
        section: words.section,
      })
      .from(words)
      .where(
        and(
          eq(words.createdBy, auth.userId),
          inArray(words.id, dueIdsArray)
        )
      );

    return NextResponse.json(wordsDue);
  } catch (error) {
    console.error("[DUE_WORDS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
