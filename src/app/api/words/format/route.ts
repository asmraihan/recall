// Formats raw glossary text into the batch-import CSV format using Gemini.
//
// Requires env:
//   GEMINI_API_KEY=...            (required) — Google AI Studio API key (free tier)
//   GEMINI_MODEL=...              (optional, defaults to gemini-flash-latest)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  buildGlossarFormatPrompt,
  type UserLanguagePreferences,
  type Language,
} from "@/lib/languages";

const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const requestSchema = z.object({
  text: z.string().min(1, "Please paste some words to format.").max(20000),
});

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(`${ENDPOINT}/${MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": process.env.GEMINI_API_KEY as string,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        // gemini-flash-latest resolves to a thinking model; without this it
        // spends the output budget on internal reasoning and can return empty
        // or truncated text. Formatting doesn't need extended thinking.
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const content = Array.isArray(parts)
    ? parts.map((p: { text?: string }) => p.text ?? "").join("")
    : undefined;
  if (typeof content !== "string" || content.trim() === "") {
    const reason =
      data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason;
    throw new Error(`AI response empty${reason ? ` (${reason})` : ""}`);
  }
  return content;
}

// Strip any accidental markdown code fences the model may wrap the CSV in.
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:csv)?\s*([\s\S]*?)\s*```$/);
  return (fenced ? fenced[1] : trimmed).trim();
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY is not configured. Add it to your environment to enable AI formatting.",
        },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { text } = requestSchema.parse(body);

    const userRow = await db
      .select({
        mainLanguage: users.mainLanguage,
        translationLanguages: users.translationLanguages,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const prefs: UserLanguagePreferences = {
      mainLanguage: (userRow[0]?.mainLanguage as Language) ?? "German",
      translationLanguages:
        (userRow[0]?.translationLanguages as Language[] | null) ?? [
          "English",
          "Bangla",
        ],
    };

    const systemPrompt = buildGlossarFormatPrompt(prefs);
    const userPrompt = `Format the following ${prefs.mainLanguage} words into the CSV format described above. Output only the CSV lines, one per word, and nothing else.

Words:
${text}`;

    const raw = await callGemini(systemPrompt, userPrompt);
    const formatted = stripCodeFences(raw);

    return NextResponse.json({ formatted });
  } catch (error) {
    console.error("[WORDS_FORMAT]", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
