import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireUser } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { publicUser } from '@/lib/mobile-user';

/** Profile + language prefs + preferred voice in one call, so the app needs
 *  one round-trip on launch instead of three. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
    if (!user) {
      return NextResponse.json(
        { error: 'User not found', code: 'not_found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ user: publicUser(user) });
  } catch (error) {
    console.error('[MOBILE_ME]', error);
    return NextResponse.json(
      { error: 'Something went wrong', code: 'internal_error' },
      { status: 500 }
    );
  }
}
