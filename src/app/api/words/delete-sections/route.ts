import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { deleteWordSections, deleteWordSectionsSchema } from "@/lib/delete-word-sections";

export async function DELETE(req: Request) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json().catch(() => null);
    const parsed = deleteWordSectionsSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Select at least one valid section." }, { status: 400 });
    const sections = [...new Set(parsed.data.sections)];
    const deleted = await deleteWordSections(db, auth.userId, sections);
    return NextResponse.json({ deleted, sections, message: `Deleted ${deleted} words from the selected sections.` });
  } catch (error) {
    console.error("[DELETE_WORD_SECTIONS]", error);
    return NextResponse.json({ error: "Could not delete the selected sections. Please try again." }, { status: 500 });
  }
}
