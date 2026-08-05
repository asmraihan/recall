import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Fixed-window rate limiter backed by a single upsert.
 *
 * `/api/mobile/auth/login` is a new unauthenticated endpoint running bcrypt at
 * cost 12 — both a credential-stuffing target and a serverless-bill DoS vector.
 *
 * In-memory counters are useless on serverless (every cold start resets, and
 * instances don't share state), and `neon-http` has no transactions, so the
 * whole check-and-increment is expressed as one atomic
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING`.
 */
export type RateLimitResult = { allowed: boolean; retryAfterSec: number };

export async function rateLimit(
  key: string,
  limit = 10,
  windowSec = 15 * 60
): Promise<RateLimitResult> {
  try {
    const rows = (await db.execute(sql`
      INSERT INTO rate_limits ("key", "count", "window_start")
      VALUES (${key}, 1, NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN rate_limits."window_start" < NOW() - make_interval(secs => ${windowSec}::int)
          THEN 1 ELSE rate_limits."count" + 1 END,
        "window_start" = CASE
          WHEN rate_limits."window_start" < NOW() - make_interval(secs => ${windowSec}::int)
          THEN NOW() ELSE rate_limits."window_start" END
      RETURNING "count", EXTRACT(EPOCH FROM "window_start")::int AS window_start_epoch
    `)) as unknown as { rows?: RateLimitRow[] } | RateLimitRow[];

    const row = (Array.isArray(rows) ? rows[0] : rows?.rows?.[0]) as
      | RateLimitRow
      | undefined;
    if (!row) return { allowed: true, retryAfterSec: 0 };

    const count = Number(row.count);
    if (count <= limit) return { allowed: true, retryAfterSec: 0 };

    const elapsed = Math.floor(Date.now() / 1000) - Number(row.window_start_epoch);
    return { allowed: false, retryAfterSec: Math.max(1, windowSec - elapsed) };
  } catch (error) {
    // Fail open: a limiter outage must not lock every user out of the app.
    console.error('[RATE_LIMIT]', error);
    return { allowed: true, retryAfterSec: 0 };
  }
}

type RateLimitRow = { count: number | string; window_start_epoch: number | string };

/** Best-effort client IP, trusting the proxy headers Vercel sets. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
