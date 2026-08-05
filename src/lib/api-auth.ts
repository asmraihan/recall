import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { verifyAccessToken } from '@/lib/mobile-auth';

export type Caller = { userId: string; role: string; via: 'bearer' | 'cookie' };

/** Bearer wins; cookie is the fallback. Never mixes the two. */
export async function getCaller(req: Request): Promise<Caller | null> {
  const header = req.headers.get('authorization');
  if (header?.startsWith('Bearer ')) {
    const claims = await verifyAccessToken(header.slice(7).trim());
    // A malformed or expired bearer is a HARD FAILURE, never a silent
    // fallback to the cookie — otherwise a stale mobile token would keep
    // working inside a webview and mask expiry bugs.
    return claims
      ? { userId: claims.sub, role: (claims.role as string) ?? 'user', via: 'bearer' }
      : null;
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return { userId: session.user.id, role: session.user.role ?? 'user', via: 'cookie' };
}

/**
 * Returns a 401 Response OR the caller.
 *
 *   const auth = await requireUser(req);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth.userId is safe here
 */
export async function requireUser(req: Request): Promise<Caller | NextResponse> {
  const caller = await getCaller(req);
  if (caller) return caller;
  return NextResponse.json(
    { error: 'Unauthorized', code: 'unauthorized' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
  );
}
