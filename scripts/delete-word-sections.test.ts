import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { DbClient } from "../src/lib/db";
import { deleteWordSections, deleteWordSectionsSchema } from "../src/lib/delete-word-sections";

const user = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

async function fixture(failAt?: number) {
  const client = new PGlite();
  await client.exec(`
    create table words (id uuid primary key, created_by uuid, section text not null);
    create table learning_sessions (id uuid primary key, user_id uuid, total_words int default 0, correct_answers int default 0, incorrect_answers int default 0, sections jsonb default '[]', status text default 'in_progress', completed_at timestamp, updated_at timestamp);
    create table session_words (id uuid primary key, session_id uuid references learning_sessions(id), word_id uuid references words(id), is_correct boolean, answered_at timestamp);
    create table learning_progress (id uuid primary key, word_id uuid references words(id), user_id uuid);
    create table user_words (id uuid primary key, original_word_id uuid references words(id), user_id uuid);
  `);
  for (const [n, owner, section] of [[10, user, "1"], [11, user, "2"], [12, user, "3"], [13, other, "1"]] as const) {
    await client.query("insert into words values ($1,$2,$3)", [id(n), owner, section]);
    await client.query("insert into learning_progress values ($1,$2,$3)", [id(n + 100), id(n), owner]);
    await client.query("insert into user_words values ($1,$2,$3)", [id(n + 200), id(n), owner]);
  }
  // Mixed session, selected-only session, and unrelated user's session.
  for (const [n, owner, total, sections] of [[20, user, 3, '["1","2","3"]'], [21, user, 1, '["1"]'], [22, other, 1, '["1"]']] as const) {
    await client.query("insert into learning_sessions (id,user_id,total_words,sections) values ($1,$2,$3,$4)", [id(n), owner, total, sections]);
  }
  for (const [n, session, word, correct] of [[30, 20, 10, false], [31, 20, 11, false], [32, 20, 12, true], [33, 21, 10, false], [34, 22, 13, true]] as const) {
    await client.query("insert into session_words values ($1,$2,$3,$4,now())", [id(n), id(session), id(word), correct]);
  }
  const db = drizzle(client);
  // Execute the production Drizzle statements against an isolated PostgreSQL
  // engine, emulating Neon HTTP's atomic batch (never a live user database).
  const adapter = new Proxy(db, {
    get(target, property) {
      if (property === "batch") return async (queries: { toSQL(): { sql: string; params: unknown[] } }[]) => client.transaction(async (tx) => {
        const results = [];
        for (const [index, query] of queries.entries()) {
          if (index === failAt) throw new Error("Simulated database failure");
          const { sql, params } = query.toSQL();
          results.push((await tx.query(sql, params)).rows);
        }
        return results;
      });
      return Reflect.get(target, property);
    },
  }) as unknown as DbClient;
  return { client, db: adapter };
}

test("deletion requires an explicit nonempty selection", () => {
  for (const body of [{}, { sections: [] }, { sections: [""] }, { sections: [" "] }, { sections: "all" }, { sections: ["1"], userId: other }]) {
    assert.equal(deleteWordSectionsSchema.safeParse(body).success, false);
  }
  assert.ok(deleteWordSectionsSchema.safeParse({ sections: ["1", "2"] }).success);
});

test("deletes selected chapters atomically and repairs only affected history", async () => {
  const { client, db } = await fixture();
  try {
    assert.equal(await deleteWordSections(db, user, ["1", "2"]), 2);
    assert.deepEqual((await client.query("select id from words order by id")).rows, [{ id: id(12) }, { id: id(13) }]);
    for (const table of ["learning_progress", "user_words", "session_words"]) {
      assert.equal((await client.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n, 2);
    }
    const mixed = (await client.query<{ total_words: number; correct_answers: number; incorrect_answers: number; sections: string[]; status: string; completed_at: Date | null }>("select total_words,correct_answers,incorrect_answers,sections,status,completed_at from learning_sessions where id=$1", [id(20)])).rows[0];
    assert.equal(mixed.total_words, 1);
    assert.equal(mixed.correct_answers, 1);
    assert.equal(mixed.incorrect_answers, 0);
    assert.deepEqual(mixed.sections, ["3"]);
    assert.equal(mixed.status, "completed");
    assert.ok(mixed.completed_at);
    assert.equal((await client.query("select id from learning_sessions where id=$1", [id(21)])).rows.length, 0);
    assert.equal((await client.query<{ total_words: number }>("select total_words from learning_sessions where id=$1", [id(22)])).rows[0].total_words, 1);
    assert.equal(await deleteWordSections(db, user, ["1", "2"]), 0);
  } finally { await client.close(); }
});

test("failure rolls back words, progress, and session history together", async () => {
  const { client, db } = await fixture(4);
  try {
    await assert.rejects(deleteWordSections(db, user, ["1"]), /Simulated database failure/);
    assert.equal((await client.query<{ n: number }>("select count(*)::int as n from words")).rows[0].n, 4);
    assert.equal((await client.query<{ n: number }>("select count(*)::int as n from learning_progress")).rows[0].n, 4);
    assert.equal((await client.query<{ n: number }>("select count(*)::int as n from session_words")).rows[0].n, 5);
  } finally { await client.close(); }
});

test("an unknown section cannot broaden deletion", async () => {
  const { client, db } = await fixture();
  try {
    assert.equal(await deleteWordSections(db, user, ["all", "1' OR TRUE --"]), 0);
    assert.equal((await client.query<{ n: number }>("select count(*)::int as n from words")).rows[0].n, 4);
  } finally { await client.close(); }
});
