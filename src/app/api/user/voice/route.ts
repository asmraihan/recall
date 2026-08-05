import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const voicePreferenceSchema = z.object({
  preferredVoice: z.string().min(1, "Preferred voice is required"),
});

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const user = await db.query.users.findFirst({
      where: eq(users.id, auth.userId),
    });

    if (!user) {
      return new NextResponse(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return NextResponse.json({
      preferredVoice: user.preferredVoice || null,
    });
  } catch (error) {
    console.error("[USER_VOICE_GET]", error);
    return new NextResponse(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const validatedData = voicePreferenceSchema.parse(body);

    const updatedUser = await db
      .update(users)
      .set({
        preferredVoice: validatedData.preferredVoice,
        updatedAt: new Date(),
      })
      .where(eq(users.id, auth.userId))
      .returning();

    return NextResponse.json({
      message: "Voice preference updated successfully",
      preferredVoice: updatedUser[0].preferredVoice,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify({ errors: error.errors }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    console.error("[USER_VOICE_PUT]", error);
    return new NextResponse(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
