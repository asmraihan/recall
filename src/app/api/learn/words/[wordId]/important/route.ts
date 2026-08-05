import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { words } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request, context: { params: Promise<{ wordId: string }> }) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { wordId } = await context.params;
    const body = await req.json().catch(() => null);
    const important = body?.important;
    if (typeof important !== "boolean") {
      return NextResponse.json(
        { error: "`important` must be a boolean" },
        { status: 400 }
      );
    }

    // Scoped to the caller's own words. Without this, any authenticated user
    // could flip the flag on any word in the database.
    const updated = await db
      .update(words)
      .set({ important })
      .where(and(eq(words.id, wordId), eq(words.createdBy, auth.userId)))
      .returning({ id: words.id });

    if (updated.length === 0) {
      return NextResponse.json({ error: "Word not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[WORD_IMPORTANT_POST]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
