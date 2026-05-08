import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { learningSessions, sessionWords, learningProgress } from "@/lib/db/schema";

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const userSessionIds = db
      .select({ id: learningSessions.id })
      .from(learningSessions)
      .where(eq(learningSessions.userId, userId));

    await db.delete(sessionWords).where(inArray(sessionWords.sessionId, userSessionIds));
    await db.delete(learningSessions).where(eq(learningSessions.userId, userId));
    await db.delete(learningProgress).where(eq(learningProgress.userId, userId));

    return NextResponse.json({ message: "All sessions deleted successfully" });
  } catch (error) {
    console.error("[DELETE_ALL_SESSIONS]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
