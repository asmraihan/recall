import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { learningProgress, words, learningSessions } from "@/lib/db/schema";
import { eq, and, sql, count, avg } from "drizzle-orm";

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
      .select({
        completedAt: learningSessions.completedAt,
      })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.userId, auth.userId),
          eq(learningSessions.status, "completed")
        )
      )
      .orderBy(sql`${learningSessions.completedAt} DESC`)
      .limit(30); // Look at last 30 days

    let streak = 0;
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    const countedDays = new Set<number>();

    for (const session of recentSessions) {
      const sessionDate = new Date(session.completedAt!);
      sessionDate.setHours(0, 0, 0, 0);
      const sessionDay = sessionDate.getTime();
      if (countedDays.has(sessionDay)) continue; // skip duplicate days
      countedDays.add(sessionDay);

      if (sessionDay === currentDate.getTime()) {
        // Session completed today
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else if (sessionDay === currentDate.getTime() - 86400000) {
        // Session completed yesterday
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        // Streak broken
        break;
      }
    }

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