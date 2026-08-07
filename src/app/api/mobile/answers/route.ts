import { NextResponse } from 'next/server';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import * as z from 'zod';
import { requireUser } from '@/lib/api-auth';
import { db } from '@/lib/db';
import {
  learningProgress,
  learningSessions,
  mobileAnswerEvents,
  sessionWords,
  words,
} from '@/lib/db/schema';
import { nextState } from '@/lib/spaced-repetition';
import { mistakesPredicate } from '@/lib/queries/mistakes';
import { computeStreak } from '@/lib/streak';

/**
 * Batch answer sync for the mobile offline queue and the home-screen widget.
 *
 * `/api/learn/sessions/[sessionId]/answer` cannot serve this: it needs a
 * pre-created session and takes one answer at a time.
 *
 * `neon-http` has no transactions, so atomicity comes from the unique index on
 * `session_words.client_event_id` — a replayed batch re-applies only the
 * answers that didn't land the first time, and the rest count as duplicates
 * rather than errors. That is what makes the client's "clear the queue only on
 * success" loop safe.
 */
const bodySchema = z.object({
  source: z.enum(['widget', 'offline']),
  answers: z
    .array(
      z.object({
        clientEventId: z.string().uuid(),
        wordId: z.string().uuid(),
        isCorrect: z.boolean(),
        answeredAt: z.number().int().positive(), // unix seconds
        direction: z.string().optional(),
      })
    )
    .min(1)
    .max(200),
});

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.userId;

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'invalid_request' },
        { status: 400 }
      );
    }
    const { source } = parsed.data;

    // Collapse repeats inside a single batch, oldest first.
    const seen = new Set<string>();
    const answers = [...parsed.data.answers]
      .sort((a, b) => a.answeredAt - b.answeredAt)
      .filter((a) => (seen.has(a.clientEventId) ? false : (seen.add(a.clientEventId), true)));

    const rejected: { wordId: string; code: string }[] = [];

    // 1. Already applied? Anything whose client_event_id is on file is a
    //    duplicate, not an error.
    //
    //    Widget answers create no session, so their key lives in
    //    mobile_answer_events rather than on session_words.
    const eventIds = answers.map((a) => a.clientEventId);
    const existing =
      source === 'widget'
        ? await db
            .select({ clientEventId: mobileAnswerEvents.clientEventId })
            .from(mobileAnswerEvents)
            .where(inArray(mobileAnswerEvents.clientEventId, eventIds))
        : await db
            .select({ clientEventId: sessionWords.clientEventId })
            .from(sessionWords)
            .where(inArray(sessionWords.clientEventId, eventIds));
    const applied = new Set(existing.map((r) => r.clientEventId as string));
    let duplicates = applied.size;

    // 2. Drop ids the user doesn't own — stale entries after a word is deleted.
    const fresh = answers.filter((a) => !applied.has(a.clientEventId));
    const ownedRows = fresh.length
      ? await db
          .select({ id: words.id })
          .from(words)
          .where(
            and(
              eq(words.createdBy, userId),
              inArray(
                words.id,
                fresh.map((a) => a.wordId)
              )
            )
          )
      : [];
    const owned = new Set(ownedRows.map((r) => r.id));

    const toApply = fresh.filter((a) => {
      if (owned.has(a.wordId)) return true;
      rejected.push({ wordId: a.wordId, code: 'not_found' });
      return false;
    });

    if (toApply.length === 0) {
      return NextResponse.json({
        applied: 0,
        duplicates,
        rejected,
        stats: await freshStats(userId),
      });
    }

    const direction = toApply.find((a) => a.direction)?.direction ?? 'main_to_trans1';

    // 3. Record the answers.
    //
    //    WIDGET answers deliberately create no session. They still drive the
    //    spaced-repetition schedule, but home-screen activity should not show
    //    up as an entry in Recent Sessions. The consequence to be aware of:
    //    the streak counts days with a COMPLETED SESSION, so a day spent only
    //    on the widget does not extend it.
    //
    //    OFFLINE answers are the tail of a real session the user was in, so
    //    they still produce one, which is also what makes them visible in
    //    history and keeps the streak intact.
    let createdSessionId: string | null = null;
    let landed: Set<string>;

    if (source === 'widget') {
      const inserted = await db
        .insert(mobileAnswerEvents)
        .values(
          toApply.map((a) => ({
            clientEventId: a.clientEventId,
            userId,
            wordId: a.wordId,
            isCorrect: a.isCorrect,
            answeredAt: new Date(a.answeredAt * 1000),
            source,
          }))
        )
        // Safety net for a batch replayed concurrently with this one.
        .onConflictDoNothing()
        .returning({ clientEventId: mobileAnswerEvents.clientEventId });
      landed = new Set(inserted.map((r) => r.clientEventId));
    } else {
      const startedAt = new Date(Math.min(...toApply.map((a) => a.answeredAt)) * 1000);
      const completedAt = new Date(Math.max(...toApply.map((a) => a.answeredAt)) * 1000);

      const [created] = await db
        .insert(learningSessions)
        .values({
          userId,
          sessionType: source,
          direction,
          sections: [],
          status: 'completed',
          totalWords: toApply.length,
          correctAnswers: toApply.filter((a) => a.isCorrect).length,
          incorrectAnswers: toApply.filter((a) => !a.isCorrect).length,
          startedAt,
          completedAt,
        })
        .returning({ id: learningSessions.id });
      createdSessionId = created.id;

      const inserted = await db
        .insert(sessionWords)
        .values(
          toApply.map((a, i) => ({
            sessionId: created.id,
            wordId: a.wordId,
            isCorrect: a.isCorrect,
            answeredAt: new Date(a.answeredAt * 1000),
            presentedAt: new Date(a.answeredAt * 1000),
            presentationOrder: i + 1,
            clientEventId: a.clientEventId,
          }))
        )
        .onConflictDoNothing()
        .returning({ clientEventId: sessionWords.clientEventId });
      landed = new Set(inserted.map((r) => r.clientEventId as string));
    }

    duplicates += toApply.length - landed.size;
    const effective = toApply.filter((a) => landed.has(a.clientEventId));

    // 4. Spaced-repetition update, sequential per word so repeated answers for
    //    the same word compound the way they would in a live session.
    if (effective.length > 0) {
      const wordIds = [...new Set(effective.map((a) => a.wordId))];
      const progressRows = await db
        .select()
        .from(learningProgress)
        .where(
          and(
            eq(learningProgress.userId, userId),
            inArray(learningProgress.wordId, wordIds)
          )
        );
      const byWord = new Map(progressRows.map((p) => [p.wordId, p]));

      for (const answer of effective) {
        const prev = byWord.get(answer.wordId);
        const state = nextState(prev ?? null, answer.isCorrect);
        const reviewedAt = new Date(answer.answeredAt * 1000);

        if (prev) {
          await db
            .update(learningProgress)
            .set({
              masteryLevel: state.masteryLevel,
              correctAttempts: state.correctAttempts,
              incorrectAttempts: state.incorrectAttempts,
              lastReviewedAt: reviewedAt,
              nextReviewDate: state.nextReviewDate,
            })
            .where(eq(learningProgress.id, prev.id));
          byWord.set(answer.wordId, { ...prev, ...state });
        } else {
          const [row] = await db
            .insert(learningProgress)
            .values({
              userId,
              wordId: answer.wordId,
              masteryLevel: state.masteryLevel,
              correctAttempts: state.correctAttempts,
              incorrectAttempts: state.incorrectAttempts,
              lastReviewedAt: reviewedAt,
              nextReviewDate: state.nextReviewDate,
              preferredDirection: direction,
            })
            .returning();
          byWord.set(answer.wordId, row);
        }
      }

      // Re-align the session counters with what actually landed.
      if (createdSessionId && effective.length !== toApply.length) {
        await db
          .update(learningSessions)
          .set({
            totalWords: effective.length,
            correctAnswers: effective.filter((a) => a.isCorrect).length,
            incorrectAnswers: effective.filter((a) => !a.isCorrect).length,
          })
          .where(eq(learningSessions.id, createdSessionId));
      }
    }

    return NextResponse.json({
      applied: effective.length,
      duplicates,
      rejected,
      ...(createdSessionId ? { sessionId: createdSessionId } : {}),
      stats: await freshStats(userId),
    });
  } catch (error) {
    console.error('[MOBILE_ANSWERS]', error);
    return NextResponse.json(
      { error: 'Something went wrong', code: 'internal_error' },
      { status: 500 }
    );
  }
}

/** Returned inline so the app can rewrite the widget payload without a second call. */
async function freshStats(userId: string) {
  const [due, mistakes, sessions] = await Promise.all([
    db
      .select({ count: count() })
      .from(learningProgress)
      .where(
        and(
          eq(learningProgress.userId, userId),
          sql`${learningProgress.nextReviewDate} <= NOW()`
        )
      ),
    db
      .select({ count: count() })
      .from(learningProgress)
      .where(and(eq(learningProgress.userId, userId), mistakesPredicate)),
    db
      .select({ completedAt: learningSessions.completedAt })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.userId, userId),
          eq(learningSessions.status, 'completed')
        )
      )
      .orderBy(sql`${learningSessions.completedAt} DESC`)
      .limit(30),
  ]);

  return {
    due: due[0].count,
    mistakes: mistakes[0].count,
    streak: computeStreak(sessions.map((s) => s.completedAt)),
  };
}
