import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { words } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    // Get distinct sections for the user's words
    const sectionsData = await db
      .select({
        section: words.section,
        count: sql<number>`count(*)`.mapWith(Number)
      })
      .from(words)
      .where(eq(words.createdBy, auth.userId))
      .groupBy(words.section)
      // Ensure sections are ordered numerically and alphabetically
      .orderBy(sql`CASE 
        WHEN section ~ '^[0-9]+$' THEN CAST(section AS INTEGER)
        ELSE NULL
      END, section`);

    return NextResponse.json({
      sections: sectionsData.map(s => s.section),
      sectionStats: sectionsData
    });
  } catch (error) {
    console.error("[SECTIONS_GET]", error);
    return new NextResponse(JSON.stringify({ error: "Internal error" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}