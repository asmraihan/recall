import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { words } from "@/lib/db/schema";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { eq } from "drizzle-orm";

const wordSchema = z.object({
  mainWord: z.string().min(1, "Main word is required"),
  translation1: z.string().nullable(),
  translation2: z.string().nullable(),
  exampleSentence: z.string().nullable(),
  notes: z.string().nullable(),
  // Coerce the CSV string ("true"/"false"/"1"/"0"/…) into a boolean.
  // Defaults to false when the column is absent (older exports) or empty.
  important: z
    .preprocess((val) => {
      if (typeof val === "boolean") return val;
      if (typeof val === "string") {
        const v = val.trim().toLowerCase();
        return v === "true" || v === "1" || v === "yes";
      }
      return false;
    }, z.boolean())
    .default(false),
  section: z.string().min(1, "Section is required"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return new NextResponse(JSON.stringify({ error: "No file provided" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Read and parse CSV
    const csvText = await file.text();
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    // Validate and transform records
    const validatedWords = records.map((record: any) => {
      const validated = wordSchema.parse(record);
      return {
        ...validated,
        createdBy: session.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    // Remove duplicates: check for existing words for this user (same mainWord AND same section)
    const existing = await db.select({
      mainWord: words.mainWord,
      section: words.section,
    }).from(words)
      .where(eq(words.createdBy, session.user.id));
    const existingSet = new Set(existing.map((e: any) => `${e.section}|||${e.mainWord}`));
    const filteredWords = validatedWords.filter((w: any) => !existingSet.has(`${w.section}|||${w.mainWord}`));
    const skippedCount = validatedWords.length - filteredWords.length;

    // Insert words in batches of 100
    const batchSize = 100;
    const results = [];
    
    for (let i = 0; i < filteredWords.length; i += batchSize) {
      const batch = filteredWords.slice(i, i + batchSize);
      const inserted = await db.insert(words).values(batch).returning();
      results.push(...inserted);
    }

    return NextResponse.json({
      message: `Imported ${results.length} new words. Skipped ${skippedCount} duplicate(s).`,
      imported: results.length,
      skipped: skippedCount,
    });
  } catch (error) {
    console.error("[WORDS_IMPORT]", error);
    
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify({ 
        error: "Invalid data format",
        details: error.errors 
      }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new NextResponse(JSON.stringify({ error: "Failed to import words" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
} 