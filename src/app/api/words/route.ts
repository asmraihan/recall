import { NextResponse, NextRequest } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { words, learningProgress } from "@/lib/db/schema";
import { eq, and, or, sql, ilike, inArray, count } from "drizzle-orm";
import { z } from "zod";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

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
    const query = (searchParams.get("q") ?? "").trim();

    const limit = Math.min(
      Math.max(Number.parseInt(searchParams.get("limit") ?? "", 10) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const page = Math.max(Number.parseInt(searchParams.get("page") ?? "", 10) || 1, 1);

    const emptyPage = { items: [], total: 0, page: 1, limit, totalPages: 0 };
    if (!sectionParam) {
      return NextResponse.json(emptyPage);
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

    const conditions = [eq(words.createdBy, auth.userId)];

    if (sectionParam !== "all") {
      conditions.push(eq(words.section, sectionParam));
    }

    if (query) {
      // Escape LIKE wildcards so a literal % or _ typed by the user does not
      // silently widen the search.
      const pattern = `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      const matchesSearch = or(
        ilike(words.mainWord, pattern),
        ilike(words.translation1, pattern),
        ilike(words.translation2, pattern)
      );
      if (matchesSearch) conditions.push(matchesSearch);
    }

    if (filterParam === "important") {
      conditions.push(eq(words.important, true));
    } else if (filterParam === "mistakes") {
      // Same criteria as the "mistakes" session type: low mastery (< 3) and
      // either more incorrect than correct attempts, or a correct ratio < 70%.
      // Expressed as a subquery so it filters in SQL rather than after the
      // whole table has been pulled into memory.
      const mistakeWordIds = db
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
      conditions.push(inArray(words.id, mistakeWordIds));
    }

    const whereCondition = and(...conditions);

    const [userWords, totalRows] = await Promise.all([
      db
        .select(selectFields)
        .from(words)
        .where(whereCondition)
        .orderBy(words.createdAt, words.id)
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ value: count() }).from(words).where(whereCondition),
    ]);

    const total = totalRows[0]?.value ?? 0;

    return NextResponse.json({
      items: userWords,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[WORDS_GET]", error);
    return new NextResponse(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
