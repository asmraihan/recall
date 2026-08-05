import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { learningSessions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const recentSessions = await db
      .select({
        id: learningSessions.id,
        type: learningSessions.sessionType,
        direction: learningSessions.direction,
        startedAt: learningSessions.startedAt,
        completedAt: learningSessions.completedAt,
        totalWords: learningSessions.totalWords,
        correctAnswers: learningSessions.correctAnswers,
        incorrectAnswers: learningSessions.incorrectAnswers,
        status: learningSessions.status,
        sections: learningSessions.sections, // include all sections
      })
      .from(learningSessions)
      .where(eq(learningSessions.userId, auth.userId))
      .orderBy(desc(learningSessions.startedAt))
      .limit(20);

    // Calculate accuracy for each session
    const sessionsWithAccuracy = recentSessions.map((session) => ({
      ...session,
      accuracy: session.totalWords > 0
        ? session.correctAnswers / (session.correctAnswers + session.incorrectAnswers)
        : 0,
      duration: session.completedAt
        ? Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
        : null,
    }));

    return NextResponse.json(sessionsWithAccuracy);
  } catch (error) {
    console.error("[LEARN_SESSIONS_RECENT_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}