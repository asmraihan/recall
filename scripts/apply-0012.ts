/**
 * Applies migration 0012 (mobile refresh tokens, rate limits, and the
 * client_event_id idempotency key on session_words).
 *
 * This repo drives schema changes with `drizzle-kit push`, so there is no
 * `__drizzle_migrations` ledger for `drizzle-kit migrate` to read — and push
 * would drop the three hand-written partial indexes, which are not
 * expressible in the Drizzle schema. So the SQL is applied directly.
 *
 * Every statement is guarded, so re-running is a no-op.
 *
 *   npx tsx scripts/apply-0012.ts
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const statements: [label: string, query: string][] = [
  [
    'create mobile_refresh_tokens',
    `CREATE TABLE IF NOT EXISTS "mobile_refresh_tokens" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "token_hash" text NOT NULL,
      "family_id" uuid NOT NULL,
      "family_started_at" timestamp DEFAULT now() NOT NULL,
      "device_id" text,
      "device_name" text,
      "expires_at" timestamp NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "last_used_at" timestamp,
      "revoked_at" timestamp,
      "superseded_at" timestamp,
      CONSTRAINT "mobile_refresh_tokens_token_hash_unique" UNIQUE("token_hash")
    )`,
  ],
  [
    'create rate_limits',
    `CREATE TABLE IF NOT EXISTS "rate_limits" (
      "key" text PRIMARY KEY NOT NULL,
      "count" integer DEFAULT 0 NOT NULL,
      "window_start" timestamp DEFAULT now() NOT NULL
    )`,
  ],
  [
    'add session_words.client_event_id',
    `ALTER TABLE "session_words" ADD COLUMN IF NOT EXISTS "client_event_id" text`,
  ],
  [
    'add mobile_refresh_tokens user fk',
    `DO $$ BEGIN
       ALTER TABLE "mobile_refresh_tokens"
         ADD CONSTRAINT "mobile_refresh_tokens_user_id_users_id_fk"
         FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
         ON DELETE cascade ON UPDATE no action;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  ],
  [
    'index mrt_family_idx',
    `CREATE INDEX IF NOT EXISTS "mrt_family_idx" ON "mobile_refresh_tokens" ("family_id")`,
  ],
  [
    'index mrt_user_active_idx',
    `CREATE INDEX IF NOT EXISTS "mrt_user_active_idx" ON "mobile_refresh_tokens" ("user_id")
       WHERE "revoked_at" IS NULL`,
  ],
  [
    'unique index session_words_client_event_id_uq',
    `CREATE UNIQUE INDEX IF NOT EXISTS "session_words_client_event_id_uq"
       ON "session_words" ("client_event_id") WHERE "client_event_id" IS NOT NULL`,
  ],
];

async function main() {
  for (const [label, query] of statements) {
    // sql`` is template-only; sql.query() is the placeholder-style form.
    await sql.query(query);
    console.log(`ok  ${label}`);
  }
  console.log('\nmigration 0012 applied.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
