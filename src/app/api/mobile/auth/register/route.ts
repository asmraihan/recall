import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import * as z from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { issueRefreshFamily, mintAccessToken } from '@/lib/mobile-auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { publicUser } from '@/lib/mobile-user';

// Same rules as the existing web /api/auth/register.
const bodySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').trim(),
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters').trim(),
  deviceId: z.string().min(1).max(128).optional(),
  deviceName: z.string().max(128).optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.errors[0]?.message ?? 'Invalid request data',
          code: 'invalid_request',
        },
        { status: 400 }
      );
    }
    const { name, email, password, deviceId, deviceName } = parsed.data;

    const limit = await rateLimit(`register:ip:${clientIp(req)}`);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: `Too many attempts. Try again in ${limit.retryAfterSec}s.`,
          code: 'rate_limited',
        },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
      );
    }

    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) {
      return NextResponse.json(
        { error: 'User with this email already exists', code: 'email_taken' },
        { status: 400 }
      );
    }

    const [user] = await db
      .insert(users)
      .values({ name, email, password: await hash(password, 12), role: 'user' })
      .returning();

    // Unlike the web flow (register, then sign in separately) mobile does both
    // in one call.
    const [accessToken, refreshToken] = await Promise.all([
      mintAccessToken(user.id, user.role ?? 'user'),
      issueRefreshFamily(user.id, deviceId, deviceName),
    ]);

    return NextResponse.json(
      { accessToken, refreshToken, user: publicUser(user) },
      { status: 201 }
    );
  } catch (error) {
    console.error('[MOBILE_REGISTER]', error);
    return NextResponse.json(
      { error: 'Something went wrong', code: 'internal_error' },
      { status: 500 }
    );
  }
}
