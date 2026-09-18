import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { words } from "@/lib/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { Parser } from "json2csv";

const defaultFields = [
  "mainWord",
  "translation1",
  "translation2",
  "exampleSentence",
  "notes",
  "important",
  "section",
  "createdAt",
  "updatedAt",
];

async function fetchWordsForUser(userId: string, sections?: string[]) {
  const conditions = [eq(words.createdBy, userId)];
  if (Array.isArray(sections) && sections.length > 0) {
    conditions.push(inArray(words.section, sections));
  }
  return db.select().from(words).where(and(...conditions)).orderBy(words.createdAt);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { ids, columns, all, sections } = body as { ids?: string[]; columns?: string[]; all?: boolean; sections?: string[] };

    let userWords: any[] = [];

    if (all) {
      userWords = await fetchWordsForUser(session.user.id as string, sections);
    } else if (Array.isArray(ids) && ids.length > 0) {
      // fetch only rows with the provided ids and belonging to the user
      const conditions = [eq(words.createdBy, session.user.id), inArray(words.id, ids)];
      if (Array.isArray(sections) && sections.length > 0) {
        conditions.push(inArray(words.section, sections));
      }
      userWords = await db.select().from(words).where(and(...conditions)).orderBy(words.createdAt);
      // reorder to match ids order
      const orderMap = new Map(ids.map((id, i) => [id, i]));
      userWords.sort((a: any, b: any) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    } else if (Array.isArray(sections) && sections.length > 0) {
      userWords = await fetchWordsForUser(session.user.id as string, sections);
    } else {
      // default: return all user's words
      userWords = await fetchWordsForUser(session.user.id as string, sections);
    }

    const requestedFields =
      Array.isArray(columns) && columns.length > 0 ? columns : defaultFields;
    // Always include the important flag so it round-trips even when a column
    // subset is selected (it isn't a toggleable table column). Set dedupes.
    const fields = Array.from(new Set([...requestedFields, "important"]));

    // Convert to CSV
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(userWords.map((row) => {
      // ensure only included fields are present in each row
      const out: Record<string, any> = {};
      for (const f of fields) {
        out[f] = (row as any)[f];
      }
      return out;
    }));
    const csvWithBom = "\uFEFF" + csv;

    // Create response with CSV file
    const response = new NextResponse(csvWithBom);
    response.headers.set("Content-Type", "text/csv");
    response.headers.set(
      "Content-Disposition",
      `attachment; filename="recall-words-${new Date().toISOString().split("T")[0]}.csv"`
    );

    return response;
  } catch (error) {
    console.error("[WORDS_EXPORT]", error);
    return new NextResponse(JSON.stringify({ error: "Failed to export words" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function GET() {
  // Keep GET for backward compatibility: export all words
  return POST(new Request('', { method: 'POST', body: JSON.stringify({ all: true }), headers: { 'Content-Type': 'application/json' } }));
}