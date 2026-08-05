import { NextResponse, NextRequest } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { words, learningProgress } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
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
  "At least one translation must be provided"
);

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const validatedData = wordSchema.parse(body);

    // Check for duplicate (same mainWord AND same section for this user)
    const existing = await db.select().from(words).where(
      and(
        eq(words.createdBy, auth.userId),
        eq(words.mainWord, validatedData.mainWord),
        eq(words.section, validatedData.section)
      )
    );
    if (existing.length > 0) {
      return new NextResponse(JSON.stringify({ error: "This word already exists in this section." }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      });
    }

    const word = await db.insert(words).values({
      mainWord: validatedData.mainWord,
      translation1: validatedData.translation1,
      translation2: validatedData.translation2,
      exampleSentence: validatedData.exampleSentence,
      notes: validatedData.notes,
      section: validatedData.section,
      createdBy: auth.userId,
    }).returning();

    return NextResponse.json({
      ...word[0],
      message: "Word added successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify({ errors: error.errors }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    console.error("[WORDS_POST]", error);
    return new NextResponse(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const sectionParam = searchParams.get("section");
    const filterParam = searchParams.get("filter");

    let userWords;

    if (!sectionParam || sectionParam === "") {
      // console.log("First condition met, returning empty array");
      return NextResponse.json([]);
    }

    const selectFields = {
      id: words.id,
      mainWord: words.mainWord,
      translation1: words.translation1,
      translation2: words.translation2,
      exampleSentence: words.exampleSentence,
      notes: words.notes,
      section: words.section,
      createdBy: words.createdBy,
      createdAt: words.createdAt,
      updatedAt: words.updatedAt,
      important: words.important,
    };

    let whereCondition;
    if (sectionParam && sectionParam !== "all") {
      whereCondition = and(eq(words.createdBy, auth.userId), eq(words.section, sectionParam));
    } else {
      whereCondition = eq(words.createdBy, auth.userId);
    }

    userWords = await db
      .select(selectFields)
      .from(words)
      .where(whereCondition)
      .orderBy(words.createdAt, words.id);

      // console.log(userWords)

    if (filterParam === "important") {
      userWords = userWords.filter((w) => w.important === true);
    } else if (filterParam === "mistakes") {
      // Same criteria as the "mistakes" session type:
      // low mastery (< 3) and either more incorrect than correct attempts
      // or a correct ratio below 70%
      const mistakeRows = await db
        .select({ wordId: learningProgress.wordId })
        .from(learningProgress)
        .where(
          and(
            eq(learningProgress.userId, auth.userId),
            sql`(
              ${learningProgress.masteryLevel} < 3
              AND (
                ${learningProgress.incorrectAttempts} > ${learningProgress.correctAttempts}
                OR (
                  ${learningProgress.correctAttempts} + ${learningProgress.incorrectAttempts} > 0
                  AND CAST(${learningProgress.correctAttempts} AS FLOAT) /
                  (${learningProgress.correctAttempts} + ${learningProgress.incorrectAttempts}) < 0.7
                )
              )
            )`
          )
        );
      const mistakeIds = new Set(mistakeRows.map((r) => r.wordId));
      userWords = userWords.filter((w) => mistakeIds.has(w.id));
    }

    return NextResponse.json(userWords);
  } catch (error) {
    console.error("[WORDS_GET]", error);
    return new NextResponse(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
