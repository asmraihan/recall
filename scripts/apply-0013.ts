/**
 * Applies migration 0013 — the idempotency ledger for session-less answers.
 *
 * Widget answers update spaced repetition but no longer create a
 * `learning_sessions` row, so they can't dedupe via
 * `session_words.client_event_id`. This table carries that key instead.
 *
 * Guarded, so re-running is a no-op.
 *
 *   npx tsx scripts/apply-0013.ts
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const statements: [label: string, query: string][] = [
  [
    'create mobile_answer_events',
    `CREATE TABLE IF NOT EXISTS "mobile_answer_events" (
      "client_event_id" text PRIMARY KEY NOT NULL,
      "user_id" uuid NOT NULL,
      "word_id" uuid NOT NULL,
      "is_correct" boolean NOT NULL,
      "answered_at" timestamp NOT NULL,
      "source" text NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )`,
  ],
  [
    'add user fk',
    `DO $$ BEGIN
       ALTER TABLE "mobile_answer_events"
         ADD CONSTRAINT "mobile_answer_events_user_id_users_id_fk"
         FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
         ON DELETE cascade ON UPDATE no action;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  ],
  [
    'index mae_user_idx',
    `CREATE INDEX IF NOT EXISTS "mae_user_idx" ON "mobile_answer_events" ("user_id")`,
  ],
];

async function main() {
  for (const [label, query] of statements) {
    await sql.query(query);
    console.log(`ok  ${label}`);
  }
  console.log('\nmigration 0013 applied.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
