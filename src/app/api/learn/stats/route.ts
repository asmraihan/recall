import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { learningProgress, words, learningSessions, sessionWords } from "@/lib/db/schema";
import { eq, and, sql, count, avg, isNotNull, desc, gte, lt } from "drizzle-orm";
import { streakSummary } from "@/lib/streak";

// GET /api/learn/stats - Get learning statistics
export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    // Get total words and mastered words
    const [totalWords, masteredWords] = await Promise.all([
      db
        .select({ count: count() })
        .from(words)
        .where(eq(words.createdBy, auth.userId)),
      db
        .select({ count: count() })
        .from(learningProgress)
        .where(
          and(
            eq(learningProgress.userId, auth.userId),
            sql`${learningProgress.masteryLevel} >= 3`
          )
        ),
    ]);

    // Get words due for review
    const dueWords = await db
      .select({ count: count() })
      .from(learningProgress)
      .where(
        and(
          eq(learningProgress.userId, auth.userId),
          sql`${learningProgress.nextReviewDate} <= NOW()`
        )
      );

    // Get learning streak (consecutive days with completed sessions)
    const recentSessions = await db
      .selectDistinct({
        day: sql<string>`date(${learningSessions.completedAt})::text`,
      })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.userId, auth.userId),
          eq(learningSessions.status, "completed"),
          isNotNull(learningSessions.completedAt)
        )
      );
    const now = new Date();
    const { streak, streakResetsAt, dayEndsAt, todayStart } = streakSummary(
      recentSessions.map(({ day }) => new Date(`${day}T00:00:00Z`)), now
    );
    const [todayRows, activeRows] = await Promise.all([
      db.select({ count: count() }).from(learningSessions).where(and(
        eq(learningSessions.userId, auth.userId), eq(learningSessions.status, "completed"),
        gte(learningSessions.completedAt, new Date(todayStart)), lt(learningSessions.completedAt, new Date(dayEndsAt))
      )),
      db.select({
        id: learningSessions.id,
        total: sql<number>`(select count(*)::int from ${sessionWords} where ${sessionWords.sessionId} = ${learningSessions.id})`,
        answered: sql<number>`(select count(*)::int from ${sessionWords} where ${sessionWords.sessionId} = ${learningSessions.id} and ${sessionWords.answeredAt} is not null)`,
      }).from(learningSessions).where(and(
        eq(learningSessions.userId, auth.userId), eq(learningSessions.status, "in_progress"),
        sql`exists (select 1 from ${sessionWords} where ${sessionWords.sessionId} = ${learningSessions.id} and ${sessionWords.answeredAt} is null)`
      )).orderBy(desc(learningSessions.startedAt)).limit(1),
    ]);

    // Get average accuracy
    const accuracyStats = await db
      .select({
        avgAccuracy: avg(
          sql`CAST(${learningSessions.correctAnswers} AS FLOAT) / 
              NULLIF(${learningSessions.correctAnswers} + ${learningSessions.incorrectAnswers}, 0)`
        ),
      })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.userId, auth.userId),
          eq(learningSessions.status, "completed")
        )
      );

    // Get section progress
    const sectionProgress = await db
      .select({
        section: words.section,
        totalWords: count(),
        masteredWords: count(
          sql`CASE WHEN ${learningProgress.masteryLevel} >= 3 THEN 1 END`
        ),
      })
      .from(words)
      .leftJoin(
        learningProgress,
        and(
          eq(learningProgress.wordId, words.id),
          eq(learningProgress.userId, auth.userId)
        )
      )
      .where(eq(words.createdBy, auth.userId))
      .groupBy(words.section)
      .orderBy(words.section);

    return NextResponse.json({
      totalWords: totalWords[0].count,
      masteredWords: masteredWords[0].count,
      dueWords: dueWords[0].count,
      learningStreak: streak,
      averageAccuracy: accuracyStats[0].avgAccuracy || 0,
      completedToday: todayRows[0].count,
      dayEndsAt,
      streakResetsAt,
      generatedAt: now.getTime(),
      activeSession: activeRows[0] ?? null,
      sectionProgress: sectionProgress.map((section) => ({
        section: section.section,
        total: Number(section.totalWords),
        mastered: Number(section.masteredWords),
        masteryPercentage:
          Number(section.totalWords) > 0
            ? (Number(section.masteredWords) / Number(section.totalWords)) * 100
            : 0,
      })),
    });
  } catch (error) {
    console.error("[LEARN_STATS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
