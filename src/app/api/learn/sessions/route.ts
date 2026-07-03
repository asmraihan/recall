import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { learningSessions, sessionWords, words, learningProgress } from "@/lib/db/schema";
import { eq, and, sql, desc, inArray, notInArray } from "drizzle-orm";

interface Word {
  id: string;
  mainWord: string;
  translation1: string | null;
  translation2: string | null;
  section: string;
}

// POST /api/learn/sessions - Start a new learning session
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { type, direction, sections, wordCount, sourceSessionId } = await req.json();

    // Validate input
    if (!type || !direction) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    // Helper: section filter
    const sectionFilter = (col: typeof words.section) =>
      Array.isArray(sections) && sections.length > 0
        ? inArray(col, sections)
        : sql`TRUE`;

    // Get words based on session type
    let wordsToLearn: Word[] = [];
    // Determine limit for custom session
    let customLimit: number | undefined = 20;
    if (["randomized", "mistakes", "important"].includes(type) && wordCount) {
      if (wordCount === "all") {
        customLimit = undefined;
      } else {
        const parsed = parseInt(wordCount, 10);
        if (!isNaN(parsed) && parsed > 0) customLimit = parsed;
      }
    }

    switch (type) {
      case "review": {
        // Get words that are due for review
        // console.log("[SESSION REVIEW] Fetching due words for review session");
        const dueWords = await db
          .select({
            wordId: learningProgress.wordId,
            nextReviewDate: learningProgress.nextReviewDate,
          })
          .from(learningProgress)
          .where(
            and(
              eq(learningProgress.userId, session.user.id),
              sql`${learningProgress.nextReviewDate} <= NOW()`
            )
          );
        const dueWordIds = dueWords.map((w) => w.wordId);
        // Debug log
        // console.log("[SESSION REVIEW] dueWordIds:", dueWordIds, "sections:", sections);
        if (dueWordIds.length > 0) {
          let query = db
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
                eq(words.createdBy, session.user.id),
                inArray(words.id, dueWordIds),
                sectionFilter(words.section)
              )
            )
            .orderBy(sql`RANDOM()`);
          wordsToLearn = await query.limit(20);
        }
        break;
      }

      case "new": {
        // Get words that haven't been learned yet
        const learnedWords = await db
          .select({ wordId: learningProgress.wordId })
          .from(learningProgress)
          .where(eq(learningProgress.userId, session.user.id));
        const learnedWordIds = learnedWords.map((w) => w.wordId);
        
        wordsToLearn = await db
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
              eq(words.createdBy, session.user.id),
              learnedWordIds.length > 0 ? notInArray(words.id, learnedWordIds) : sql`TRUE`,
              sectionFilter(words.section)
            )
          )
          .orderBy(sql`RANDOM()`)
          .limit(20);
        break;
      }

      case "mistakes": {
        // Get words that need practice based on:
        // 1. Low mastery level (< 3)
        // 2. More incorrect than correct attempts
        // 3. Poor performance ratio (less than 70% correct)
        const mistakeWords = await db
          .select({
            wordId: learningProgress.wordId,
            masteryLevel: learningProgress.masteryLevel,
            correctAttempts: learningProgress.correctAttempts,
            incorrectAttempts: learningProgress.incorrectAttempts,
          })
          .from(learningProgress)
          .where(
            and(
              eq(learningProgress.userId, session.user.id),
              sql`(
                ${learningProgress.masteryLevel} < 3 
                AND (
                  ${learningProgress.incorrectAttempts} > ${learningProgress.correctAttempts}
                  OR (
                    ${learningProgress.correctAttempts} + ${learningProgress.incorrectAttempts} > 0
                    AND CAST(${learningProgress.correctAttempts} AS FLOAT) / 
                    (${learningProgress.correctAttempts} + ${learningProgress.incorrectAttempts}) < 0.7
                  )
                )
              )`
            )
          );
        const mistakeWordIds = mistakeWords.map((w) => w.wordId);
        if (mistakeWordIds.length > 0) {
          let query = db
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
                eq(words.createdBy, session.user.id),
                inArray(words.id, mistakeWordIds),
                sectionFilter(words.section)
              )
            )
            .orderBy(sql`RANDOM()`);
          wordsToLearn = customLimit ? await query.limit(customLimit) : await query;
        }
        break;
      }

      case "important": {
        // Get all words marked as important for this user
        let query = db
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
              eq(words.createdBy, session.user.id),
              eq(words.important, true),
              sectionFilter(words.section)
            )
          )
          .orderBy(sql`RANDOM()`);
        wordsToLearn = customLimit ? await query.limit(customLimit) : await query;
        break;
      }

      case "randomized": {
        let query = db
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
              eq(words.createdBy, session.user.id),
              sectionFilter(words.section)
            )
          )
          .orderBy(sql`RANDOM()`);
        wordsToLearn = customLimit ? await query.limit(customLimit) : await query;
        break;
      }

      case "session_mistakes": {
        // Re-practice only the words answered incorrectly in a specific session
        if (!sourceSessionId) {
          return new NextResponse("Missing sourceSessionId", { status: 400 });
        }
        const wrongRows = await db
          .select({ wordId: sessionWords.wordId })
          .from(sessionWords)
          .where(
            and(
              eq(sessionWords.sessionId, sourceSessionId),
              eq(sessionWords.isCorrect, false)
            )
          );
        const wrongWordIds = wrongRows.map((w) => w.wordId);
        if (wrongWordIds.length > 0) {
          wordsToLearn = await db
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
                eq(words.createdBy, session.user.id),
                inArray(words.id, wrongWordIds)
              )
            )
            .orderBy(sql`RANDOM()`);
        }
        break;
      }

      default:
        wordsToLearn = await db
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
              eq(words.createdBy, session.user.id),
              sectionFilter(words.section)
            )
          )
          .orderBy(sql`RANDOM()`)
          .limit(20);
    }

    if (wordsToLearn.length === 0) {
      return new NextResponse(
        JSON.stringify({
          error: "No words available for this session type",
        }),
        { status: 400 }
      );
    }

    // Create new session
    const sessionId = crypto.randomUUID();
    await db.insert(learningSessions).values({
      id: sessionId,
      userId: session.user.id,
      sessionType: type,
      direction,
      sections: Array.isArray(sections) ? sections : [],
      status: "in_progress",
      totalWords: wordsToLearn.length,
      correctAnswers: 0,
      incorrectAnswers: 0,
      startedAt: new Date(),
    });

    // Add words to session
    await db.insert(sessionWords).values(
      wordsToLearn.map((word: Word, index: number) => ({
        sessionId,
        wordId: word.id,
        presentationOrder: index + 1,
        presentedAt: new Date(),
      }))
    );

    return NextResponse.json({
      sessionId,
      words: wordsToLearn,
    });
  } catch (error) {
    console.error("[LEARN_SESSIONS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

// GET /api/learn/sessions/recent - Get recent learning sessions
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

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
      .where(eq(learningSessions.userId, session.user.id))
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
    console.error("[LEARN_SESSIONS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}