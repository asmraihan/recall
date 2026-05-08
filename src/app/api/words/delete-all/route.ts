import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { words, sessionWords, learningProgress, userWords } from "@/lib/db/schema";

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const userWordIds = db
      .select({ id: words.id })
      .from(words)
      .where(eq(words.createdBy, userId));

    await db.delete(sessionWords).where(inArray(sessionWords.wordId, userWordIds));
    await db.delete(learningProgress).where(inArray(learningProgress.wordId, userWordIds));
    await db.delete(userWords).where(inArray(userWords.originalWordId, userWordIds));
    await db.delete(words).where(eq(words.createdBy, userId));

    return NextResponse.json({ message: "All words deleted successfully" });
  } catch (error) {
    console.error("[DELETE_ALL_WORDS]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
