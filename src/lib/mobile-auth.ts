/**
 * Mobile token auth: short-lived signed access tokens (JWS/HS256) plus opaque,
 * rotating refresh tokens stored as SHA-256 hashes.
 *
 * The web app's cookie session is untouched — this is an additive second way
 * to authenticate, used only by the Expo client.
 */
import { hkdfSync, randomBytes, createHash } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mobileRefreshTokens } from '@/lib/db/schema';

const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_DAYS = 60;
export const REFRESH_FAMILY_MAX_DAYS = 180;
const ISS = 'recall';
const AUD = 'recall-mobile';

let cachedKey: Uint8Array | null = null;

function signingKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const explicit = process.env.MOBILE_JWT_SECRET;
  if (explicit) {
    cachedKey = new TextEncoder().encode(explicit);
  } else {
    const base = process.env.NEXTAUTH_SECRET;
    if (!base) throw new Error('NEXTAUTH_SECRET or MOBILE_JWT_SECRET required');
    // Domain-separated derivation: distinct key material from the NextAuth
    // cookie key, no new env var to provision, and rotating NEXTAUTH_SECRET
    // rotates both.
    cachedKey = new Uint8Array(
      hkdfSync('sha256', base, 'recall-mobile-salt', 'recall/mobile-access/v1', 32)
    );
  }
  return cachedKey;
}

export async function mintAccessToken(userId: string, role: string) {
  return new SignJWT({ role, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt()
    .setJti(randomBytes(12).toString('hex'))
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(signingKey());
}

export async function verifyAccessToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISS,
      audience: AUD,
      // Non-optional: without this, jwtVerify honours the token's own `alg`
      // header, which is the classic algorithm-confusion vulnerability.
      algorithms: ['HS256'],
      clockTolerance: 30,
    });
    if (payload.typ !== 'access' || !payload.sub) return null;
    return payload as JWTPayload & { sub: string; role?: string };
  } catch {
    return null;
  }
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function newRefreshToken() {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: sha256(raw) };
}

export const ACCESS_TOKEN_TTL_SEC = ACCESS_TTL_SEC;

/** Issues the first refresh token of a brand-new family (login / register). */
export async function issueRefreshFamily(
  userId: string,
  deviceId?: string,
  deviceName?: string
) {
  const next = newRefreshToken();
  await db.insert(mobileRefreshTokens).values({
    userId,
    tokenHash: next.hash,
    familyId: crypto.randomUUID(),
    deviceId: deviceId ?? null,
    deviceName: deviceName ?? null,
    expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 864e5),
  });
  return next.raw;
}

export type RotateResult =
  | { ok: true; userId: string; refreshToken: string }
  | { error: 'invalid' | 'expired' | 'reuse' | 'in_progress' };

/**
 * Rotates a refresh token.
 *
 * `neon-http` throws on `transaction()`, so atomicity comes from a single
 * compare-and-swap UPDATE: exactly one concurrent caller can claim the row.
 */
export async function rotateRefreshToken(
  rawToken: string,
  deviceId?: string
): Promise<RotateResult> {
  const hash = sha256(rawToken);
  const now = new Date();

  // 1. Atomic claim.
  const claimed = await db
    .update(mobileRefreshTokens)
    .set({ revokedAt: now, supersededAt: now, lastUsedAt: now })
    .where(
      and(
        eq(mobileRefreshTokens.tokenHash, hash),
        isNull(mobileRefreshTokens.revokedAt),
        sql`${mobileRefreshTokens.expiresAt} > NOW()`
      )
    )
    .returning({
      id: mobileRefreshTokens.id,
      userId: mobileRefreshTokens.userId,
      familyId: mobileRefreshTokens.familyId,
      familyStartedAt: mobileRefreshTokens.familyStartedAt,
    });

  if (claimed.length === 0) {
    const [existing] = await db
      .select()
      .from(mobileRefreshTokens)
      .where(eq(mobileRefreshTokens.tokenHash, hash));

    if (!existing) return { error: 'invalid' }; // never issued, or logged out
    if (existing.expiresAt <= new Date()) return { error: 'expired' };

    // Already rotated. Two very different cases:
    const GRACE_MS = 60_000;
    if (
      existing.supersededAt &&
      Date.now() - existing.supersededAt.getTime() < GRACE_MS
    ) {
      // The app has two JS runtimes (UI + background task) that cannot be
      // serialised by an in-process mutex. Without this window a routine
      // concurrent refresh looks exactly like token theft, and we would burn
      // the family and silently sign the user out.
      return { error: 'in_progress' };
    }

    // Replay of an old token → assume theft, burn the family.
    await db
      .update(mobileRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(mobileRefreshTokens.familyId, existing.familyId),
          isNull(mobileRefreshTokens.revokedAt)
        )
      );
    return { error: 'reuse' };
  }

  const row = claimed[0];
  if (Date.now() - row.familyStartedAt.getTime() > REFRESH_FAMILY_MAX_DAYS * 864e5) {
    return { error: 'expired' };
  }

  const next = newRefreshToken();
  await db.insert(mobileRefreshTokens).values({
    userId: row.userId,
    tokenHash: next.hash,
    familyId: row.familyId,
    familyStartedAt: row.familyStartedAt,
    deviceId: deviceId ?? null,
    expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 864e5),
  });

  return { ok: true, userId: row.userId, refreshToken: next.raw };
}

/** Revokes one token, its whole family, or every family belonging to a user. */
export async function revokeRefreshToken(rawToken: string, allDevices = false) {
  const hash = sha256(rawToken);
  const [existing] = await db
    .select({
      userId: mobileRefreshTokens.userId,
      familyId: mobileRefreshTokens.familyId,
    })
    .from(mobileRefreshTokens)
    .where(eq(mobileRefreshTokens.tokenHash, hash));

  if (!existing) return;

  await db
    .update(mobileRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        allDevices
          ? eq(mobileRefreshTokens.userId, existing.userId)
          : eq(mobileRefreshTokens.familyId, existing.familyId),
        isNull(mobileRefreshTokens.revokedAt)
      )
    );
}
