import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import * as z from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { issueRefreshFamily, mintAccessToken } from '@/lib/mobile-auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { publicUser } from '@/lib/mobile-user';

const bodySchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(1),
  deviceId: z.string().min(1).max(128).optional(),
  deviceName: z.string().max(128).optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid email or password', code: 'invalid_credentials' },
        { status: 401 }
      );
    }
    const { email, password, deviceId, deviceName } = parsed.data;

    // bcrypt at cost 12 on an unauthenticated endpoint: throttle on both the
    // source IP and the targeted account.
    const ip = clientIp(req);
    for (const key of [`login:ip:${ip}`, `login:email:${email}`]) {
      const limit = await rateLimit(key);
      if (!limit.allowed) {
        return NextResponse.json(
          {
            error: `Too many attempts. Try again in ${limit.retryAfterSec}s.`,
            code: 'rate_limited',
          },
          { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
        );
      }
    }

    const user = await db.query.users.findFirst({ where: eq(users.email, email) });

    // One generic message for "no such user" and "wrong password". The web
    // authorize() distinguishes them, which is a user-enumeration leak; this
    // deliberately does not copy that.
    const invalid = NextResponse.json(
      { error: 'Invalid email or password', code: 'invalid_credentials' },
      { status: 401 }
    );
    if (!user || !user.password) return invalid;
    if (!(await compare(password, user.password))) return invalid;

    const [accessToken, refreshToken] = await Promise.all([
      mintAccessToken(user.id, user.role ?? 'user'),
      issueRefreshFamily(user.id, deviceId, deviceName),
    ]);

    return NextResponse.json({ accessToken, refreshToken, user: publicUser(user) });
  } catch (error) {
    console.error('[MOBILE_LOGIN]', error);
    return NextResponse.json(
      { error: 'Something went wrong', code: 'internal_error' },
      { status: 500 }
    );
  }
}
