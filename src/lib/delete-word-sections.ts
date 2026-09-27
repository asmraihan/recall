import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbClient } from "./db";
import { words, sessionWords, learningProgress, userWords, learningSessions } from "./db/schema";

export const deleteWordSectionsSchema = z.object({
  sections: z.array(z.string().min(1).refine((value) => value.trim().length > 0)).min(1).max(500),
}).strict();

export async function deleteWordSections(db: DbClient, userId: string, sections: string[]) {
  // Freeze the exact owned IDs before deleting. Newly added words are never
  // accidentally swept up by repeating a section-wide predicate later.
  const owned = await db.select({ id: words.id }).from(words)
    .where(and(eq(words.createdBy, userId), inArray(words.section, sections)));
  const ids = owned.map(({ id }) => id);
  if (!ids.length) return 0;
  const affected = await db.selectDistinct({ id: sessionWords.sessionId }).from(sessionWords)
    .where(inArray(sessionWords.wordId, ids));
  const affectedSessions = and(eq(learningSessions.userId, userId), inArray(learningSessions.id, affected.map(({ id }) => id)));
  const total = sql<number>`(select count(*)::int from ${sessionWords} where ${sessionWords.sessionId} = ${learningSessions.id})`;
  const answered = sql<number>`(select count(*)::int from ${sessionWords} where ${sessionWords.sessionId} = ${learningSessions.id} and ${sessionWords.answeredAt} is not null)`;

  // Neon HTTP batch runs these statements in one transaction, including FK
  // cleanup and history repair. A failure must not leave half-deleted data.
  const results = await db.batch([
    db.delete(sessionWords).where(inArray(sessionWords.wordId, ids)),
    db.delete(learningProgress).where(inArray(learningProgress.wordId, ids)),
    db.delete(userWords).where(inArray(userWords.originalWordId, ids)),
    db.delete(words).where(and(eq(words.createdBy, userId), inArray(words.id, ids))).returning({ id: words.id }),
    db.update(learningSessions).set({
      totalWords: total,
      correctAnswers: sql`(select count(*)::int from ${sessionWords} where ${sessionWords.sessionId} = ${learningSessions.id} and ${sessionWords.answeredAt} is not null and ${sessionWords.isCorrect} = true)`,
      incorrectAnswers: sql`(select count(*)::int from ${sessionWords} where ${sessionWords.sessionId} = ${learningSessions.id} and ${sessionWords.answeredAt} is not null and ${sessionWords.isCorrect} = false)`,
      sections: sql`(select coalesce(jsonb_agg(distinct ${words.section}), '[]'::jsonb) from ${sessionWords} join ${words} on ${words.id} = ${sessionWords.wordId} where ${sessionWords.sessionId} = ${learningSessions.id})`,
      status: sql`case when ${answered} >= ${total} then 'completed' else ${learningSessions.status} end`,
      completedAt: sql`case when ${answered} >= ${total} then coalesce(${learningSessions.completedAt}, now()) else ${learningSessions.completedAt} end`,
      updatedAt: new Date(),
    }).where(affectedSessions),
    db.delete(learningSessions).where(and(affectedSessions, sql`${total} = 0`)),
  ]);
  return results[3].length;
}
