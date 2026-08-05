CREATE TABLE "mobile_refresh_tokens" (
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
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_words" ADD COLUMN "client_event_id" text;--> statement-breakpoint
ALTER TABLE "mobile_refresh_tokens" ADD CONSTRAINT "mobile_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mrt_family_idx" ON "mobile_refresh_tokens" ("family_id");--> statement-breakpoint
CREATE INDEX "mrt_user_active_idx" ON "mobile_refresh_tokens" ("user_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "session_words_client_event_id_uq" ON "session_words" ("client_event_id") WHERE "client_event_id" IS NOT NULL;