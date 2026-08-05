import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import * as z from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { mintAccessToken, rotateRefreshToken } from '@/lib/mobile-auth';

const bodySchema = z.object({
  refreshToken: z.string().min(1),
  deviceId: z.string().min(1).max(128).optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid refresh token', code: 'refresh_invalid' },
        { status: 401 }
      );
    }

    const result = await rotateRefreshToken(
      parsed.data.refreshToken,
      parsed.data.deviceId
    );

    if (!('ok' in result)) {
      // 409 means "the other runtime already won — re-read storage and retry
      // once". Only 401 means sign the user out.
      if (result.error === 'in_progress') {
        return NextResponse.json(
          { error: 'Refresh already in progress', code: 'refresh_in_progress' },
          { status: 409 }
        );
      }
      const codes = {
        invalid: 'refresh_invalid',
        expired: 'refresh_expired',
        reuse: 'refresh_reuse',
      } as const;
      const messages = {
        invalid: 'Invalid refresh token',
        expired: 'Refresh token expired',
        reuse: 'Refresh token reuse detected',
      } as const;
      return NextResponse.json(
        { error: messages[result.error], code: codes[result.error] },
        { status: 401 }
      );
    }

    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, result.userId));

    const accessToken = await mintAccessToken(result.userId, user?.role ?? 'user');
    return NextResponse.json({ accessToken, refreshToken: result.refreshToken });
  } catch (error) {
    console.error('[MOBILE_REFRESH]', error);
    return NextResponse.json(
      { error: 'Something went wrong', code: 'internal_error' },
      { status: 500 }
    );
  }
}
