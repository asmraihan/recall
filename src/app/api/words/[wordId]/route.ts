import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { words } from "@/lib/db/schema";
import { z } from "zod";

const wordSchema = z.object({
  mainWord: z.string().min(1, "Main word is required"),
  translation1: z.string().optional(),
  translation2: z.string().optional(),
  exampleSentence: z.string().optional(),
  notes: z.string().optional(),
  section: z.string().min(1, "Section is required"),
}).refine(
  (data) => data.translation1 || data.translation2,
  "Either first or second translation must be provided"
);


export async function GET(req: Request, context: { params: Promise<{ wordId: string }> }) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;
    const { wordId } = await context.params;
    const [word] = await db.select().from(words).where(and(eq(words.id, wordId), eq(words.createdBy, auth.userId)));
    if (!word) {
      return new NextResponse(JSON.stringify({ error: "Word not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    return NextResponse.json(word);
  } catch (error) {
    console.error("[WORDS_GET_ONE]", error);
    return new NextResponse(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}


// PATCH and GET (single) for /api/words/[wordId]
export async function PATCH( req: Request,
  context: { params: Promise<{ wordId: string }> }) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;
    const { wordId } = await context.params;
    const body = await req.json();
    const validatedData = wordSchema.parse(body);

    // Only allow editing user's own word
    const [existing] = await db.select().from(words).where(and(eq(words.id, wordId), eq(words.createdBy, auth.userId)));
    if (!existing) {
      return new NextResponse(JSON.stringify({ error: "Word not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    const updated = await db.update(words)
      .set({ ...validatedData })
      .where(and(eq(words.id, wordId), eq(words.createdBy, auth.userId)))
      .returning();

    return NextResponse.json({ ...updated[0], message: "Word updated successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify({ errors: error.errors }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    console.error("[WORDS_PATCH]", error);
    return new NextResponse(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}


export async function DELETE(
  req: Request,
  context: { params: Promise<{ wordId: string }> }
) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const { wordId } = await context.params;

    // Delete the word only if it belongs to the user
    const result = await db
      .delete(words)
      .where(
        and(
          eq(words.id, wordId),
          eq(words.createdBy, auth.userId)
        )
      )
      .returning();

    if (result.length === 0) {
      return new NextResponse(JSON.stringify({ error: "Word not found" }), { 
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[WORD_DELETE]", error);
    return new NextResponse(JSON.stringify({ error: "Internal error" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}