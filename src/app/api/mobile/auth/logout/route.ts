import { NextResponse } from 'next/server';
import { revokeRefreshToken } from '@/lib/mobile-auth';

/**
 * Always 200, even for an unknown token — the client's only sane reaction to
 * any other status is to discard local state anyway, and reporting "no such
 * token" would leak whether one existed.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      refreshToken?: unknown;
      allDevices?: unknown;
    };
    if (typeof body.refreshToken === 'string' && body.refreshToken.length > 0) {
      await revokeRefreshToken(body.refreshToken, body.allDevices === true);
    }
  } catch (error) {
    console.error('[MOBILE_LOGOUT]', error);
  }
  return NextResponse.json({ success: true });
}
