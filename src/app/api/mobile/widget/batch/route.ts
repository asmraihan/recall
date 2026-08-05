import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { and, count, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import { requireUser } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { learningProgress, learningSessions, users, words } from '@/lib/db/schema';
import { mistakesPredicate } from '@/lib/queries/mistakes';
import { sectionLabel } from '@/lib/quiz';
import { publicUser } from '@/lib/mobile-user';
import { computeStreak } from '@/lib/streak';

/**
 * The whole widget payload in one call: a `words` dictionary plus decks that
 * hold only ids.
 *
 * The app is the sole network client; widgets are pure readers of the file the
 * app writes. Shipping every deck at once means reconfiguring a widget is
 * instant and works offline, and one fetch serves N widgets.
 */
const PER_DECK_DEFAULT = 40;
const PER_DECK_MAX = 60;
const ALL_DECK_CAP = 200;
const MAX_SECTION_DECKS = 6;
const SOFT_TTL_SEC = 6 * 3600;
const HARD_TTL_SEC = 72 * 3600;

type WordRow = {
  id: string;
  mainWord: string;
  translation1: string | null;
  translation2: string | null;
  section: string;
  exampleSentence: string | null;
  important: boolean;
};

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.userId;

  try {
    const url = new URL(req.url);
    const perDeck = Math.min(
      PER_DECK_MAX,
      Math.max(1, Number(url.searchParams.get('perDeck')) || PER_DECK_DEFAULT)
    );
    const pinned = (url.searchParams.get('sections') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_SECTION_DECKS);

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return NextResponse.json(
        { error: 'User not found', code: 'not_found' },
        { status: 404 }
      );
    }
    const profile = publicUser(user);

    const wordCols = {
      id: words.id,
      mainWord: words.mainWord,
      translation1: words.translation1,
      translation2: words.translation2,
      section: words.section,
      exampleSentence: words.exampleSentence,
      important: words.important,
    };

    // --- deck id selection -------------------------------------------------
    const dueRows = await db
      .select({ ...wordCols, lvl: learningProgress.masteryLevel })
      .from(learningProgress)
      .innerJoin(words, eq(words.id, learningProgress.wordId))
      .where(
        and(
          eq(learningProgress.userId, userId),
          eq(words.createdBy, userId),
          sql`${learningProgress.nextReviewDate} <= NOW()`
        )
      )
      .orderBy(learningProgress.nextReviewDate)
      .limit(perDeck);

    const mistakeRows = await db
      .select({ ...wordCols, lvl: learningProgress.masteryLevel })
      .from(learningProgress)
      .innerJoin(words, eq(words.id, learningProgress.wordId))
      .where(
        and(
          eq(learningProgress.userId, userId),
          eq(words.createdBy, userId),
          mistakesPredicate
        )
      )
      .orderBy(sql`RANDOM()`)
      .limit(perDeck);

    const importantRows = await db
      .select(wordCols)
      .from(words)
      .where(and(eq(words.createdBy, userId), eq(words.important, true)))
      .orderBy(sql`RANDOM()`)
      .limit(perDeck);

    const learnedIds = (
      await db
        .select({ wordId: learningProgress.wordId })
        .from(learningProgress)
        .where(eq(learningProgress.userId, userId))
    ).map((r) => r.wordId);

    const newRows = await db
      .select(wordCols)
      .from(words)
      .where(
        and(
          eq(words.createdBy, userId),
          learnedIds.length > 0 ? notInArray(words.id, learnedIds) : sql`TRUE`
        )
      )
      .orderBy(sql`RANDOM()`)
      .limit(perDeck);

    // Never the full vocabulary — nobody rotates through 900 words on a widget.
    const allRows = await db
      .select(wordCols)
      .from(words)
      .where(eq(words.createdBy, userId))
      .orderBy(sql`RANDOM()`)
      .limit(ALL_DECK_CAP);

    // --- counts, sections, stats -------------------------------------------
    const [totals, masteredCount, dueCount, mistakeCount, importantCount] =
      await Promise.all([
        db
          .select({ count: count() })
          .from(words)
          .where(eq(words.createdBy, userId)),
        db
          .select({ count: count() })
          .from(learningProgress)
          .where(
            and(
              eq(learningProgress.userId, userId),
              sql`${learningProgress.masteryLevel} >= 3`
            )
          ),
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
          .select({ count: count() })
          .from(words)
          .where(and(eq(words.createdBy, userId), eq(words.important, true))),
      ]);

    const sectionRows = await db
      .select({
        section: words.section,
        total: count(),
        mastered: count(sql`CASE WHEN ${learningProgress.masteryLevel} >= 3 THEN 1 END`),
      })
      .from(words)
      .leftJoin(
        learningProgress,
        and(
          eq(learningProgress.wordId, words.id),
          eq(learningProgress.userId, userId)
        )
      )
      .where(eq(words.createdBy, userId))
      .groupBy(words.section);

    const sections = sectionRows
      .map((s) => ({
        k: s.section,
        label: sectionLabel(s.section),
        n: Number(s.total),
        mastered: Number(s.mastered),
      }))
      .sort(naturalBySection);

    const streakRows = await db
      .select({ completedAt: learningSessions.completedAt })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.userId, userId),
          eq(learningSessions.status, 'completed'),
          isNotNull(learningSessions.completedAt)
        )
      )
      .orderBy(sql`${learningSessions.completedAt} DESC`)
      .limit(30);

    // Section decks: whatever the user pinned in app settings, else the six
    // biggest sections.
    const deckSections = (
      pinned.length > 0
        ? sections.filter((s) => pinned.includes(s.k))
        : [...sections].sort((a, b) => b.n - a.n).slice(0, MAX_SECTION_DECKS)
    ).slice(0, MAX_SECTION_DECKS);

    const sectionDeckRows = deckSections.length
      ? await db
          .select(wordCols)
          .from(words)
          .where(
            and(
              eq(words.createdBy, userId),
              inArray(
                words.section,
                deckSections.map((s) => s.k)
              )
            )
          )
          .orderBy(sql`RANDOM()`)
      : [];

    // --- normalise ---------------------------------------------------------
    const lvlByWord = new Map<string, number>();
    for (const row of [...dueRows, ...mistakeRows]) {
      lvlByWord.set(row.id, row.lvl);
    }

    const dict: Record<string, unknown> = {};
    const remember = (row: WordRow) => {
      if (dict[row.id]) return row.id;
      dict[row.id] = {
        m: row.mainWord,
        t1: row.translation1,
        t2: row.translation2,
        s: row.section,
        ...(row.exampleSentence ? { x: row.exampleSentence } : {}),
        ...(row.important ? { i: true } : {}),
        ...(lvlByWord.has(row.id) ? { lvl: lvlByWord.get(row.id) } : {}),
      };
      return row.id;
    };

    const deck = (k: string, label: string, n: number, rows: WordRow[]) => ({
      k,
      label,
      n,
      ids: rows.map(remember),
    });

    const decks = [
      deck('due', 'Due for review', Number(dueCount[0].count), dueRows),
      deck('mistakes', 'Trouble words', Number(mistakeCount[0].count), mistakeRows),
      deck('important', 'Starred', Number(importantCount[0].count), importantRows),
      deck(
        'new',
        'Not yet learned',
        Math.max(0, Number(totals[0].count) - learnedIds.length),
        newRows
      ),
      deck('all', 'All words', Number(totals[0].count), allRows),
      ...deckSections.map((s) =>
        deck(
          `sec:${s.k}`,
          s.label,
          s.n,
          sectionDeckRows.filter((w) => w.section === s.k).slice(0, perDeck)
        )
      ),
    ];

    // The SERVER stamps these — device clocks lie.
    const gen = Math.floor(Date.now() / 1000);

    return NextResponse.json(
      {
        v: 1,
        gen,
        soft: gen + SOFT_TTL_SEC,
        hard: gen + HARD_TTL_SEC,
        state: Number(totals[0].count) === 0 ? 'empty' : 'ok',
        acct: createHash('sha256').update(userId).digest('hex').slice(0, 16),
        lang: {
          main: profile.mainLanguage,
          t1: profile.translationLanguages[0] ?? 'English',
          t2: profile.translationLanguages[1] ?? 'Bangla',
        },
        stats: {
          due: Number(dueCount[0].count),
          mistakes: Number(mistakeCount[0].count),
          important: Number(importantCount[0].count),
          new: Math.max(0, Number(totals[0].count) - learnedIds.length),
          total: Number(totals[0].count),
          mastered: Number(masteredCount[0].count),
          streak: computeStreak(streakRows.map((s) => s.completedAt)),
        },
        sections,
        words: dict,
        decks,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('[MOBILE_WIDGET_BATCH]', error);
    return NextResponse.json(
      { error: 'Something went wrong', code: 'internal_error' },
      { status: 500 }
    );
  }
}

/** Numeric sections first in numeric order, then the rest alphabetically —
 *  matching /api/words/sections rather than the text ordering of /learn/stats. */
function naturalBySection(a: { k: string }, b: { k: string }) {
  const na = Number(a.k);
  const nb = Number(b.k);
  const aNum = !Number.isNaN(na);
  const bNum = !Number.isNaN(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.k.localeCompare(b.k);
}
