// Requires env:
//   OPENROUTER_API_KEY=...        (required)
//   OPENROUTER_MODEL=...          (optional, defaults to google/gemini-2.0-flash-exp:free)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { words, users } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import { aiResponseSchema, QUIZ_QUESTION_COUNT, type QuizMeta } from "@/lib/quiz";

const vocabRequestSchema = z.object({
  mode: z.literal("vocabulary"),
  sections: z.array(z.string()).min(1),
});

const grammarRequestSchema = z.object({
  mode: z.literal("grammar"),
  level: z.enum(["A1", "A2", "B1"]),
  full: z.boolean(),
  topicIds: z.array(z.string()).optional(),
});

const requestSchema = z.discriminatedUnion("mode", [
  vocabRequestSchema,
  grammarRequestSchema,
]);

const MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp:free";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

function sliceLessonByTopicIds(markdown: string, topicIds: string[]): string {
  if (topicIds.length === 0) return markdown;
  const wanted = new Set(topicIds);
  const lines = markdown.split("\n");
  const result: string[] = [];
  let pastFirstH2 = false;
  let include = true;

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      pastFirstH2 = true;
      include = wanted.has(slugify(h2[1]));
    }
    if (!pastFirstH2 || include) {
      result.push(line);
    }
  }

  return result.join("\n");
}

const SYSTEM_PROMPT = `You are a language learning quiz generator.

Output a single JSON object matching this exact shape (no markdown fences, no extra prose):

{
  "questions": [
    { "type": "true_false", "prompt": "string", "answer": true | false, "explanation": "1-2 sentence string" },
    { "type": "multiple_choice", "prompt": "string", "options": ["A", "B", "C", "D"], "answerIndex": 0, "explanation": "string" },
    { "type": "fill_blank", "prompt": "string with ____ for the blank", "answer": "the word", "acceptableAnswers": ["variants"], "explanation": "string" }
  ]
}

Rules:
- EXACTLY ${QUIZ_QUESTION_COUNT} questions.
- Mix types: roughly 3 true_false, 4 multiple_choice, 3 fill_blank.
- All distractors in multiple_choice must be plausible (same word class / similar register).
- For fill_blank: the surrounding context must make the answer unambiguous; the answer is a single word.
- Test understanding, usage, and common pitfalls — never trivia.
- Keep explanations concise and instructive.`;

async function callAI(
  messages: Array<{ role: "system" | "user"; content: string }>
): Promise<unknown> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://recall-io.vercel.app",
      "X-Title": "Recall Quiz",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI response empty");
  return JSON.parse(content);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        {
          error:
            "OPENROUTER_API_KEY is not configured. Add it to your environment to enable AI quizzes.",
        },
        { status: 503 }
      );
    }

    const body = await req.json();
    const parsed = requestSchema.parse(body);

    const userRow = await db
      .select({
        mainLanguage: users.mainLanguage,
        translationLanguages: users.translationLanguages,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    const mainLang = userRow[0]?.mainLanguage ?? "German";
    const learnerLang =
      (userRow[0]?.translationLanguages as string[] | null)?.[0] ?? "English";

    let messages: Array<{ role: "system" | "user"; content: string }>;
    let meta: QuizMeta;

    if (parsed.mode === "vocabulary") {
      const rows = await db
        .select({
          mainWord: words.mainWord,
          translation1: words.translation1,
          translation2: words.translation2,
          exampleSentence: words.exampleSentence,
          section: words.section,
        })
        .from(words)
        .where(
          and(
            eq(words.createdBy, session.user.id),
            inArray(words.section, parsed.sections)
          )
        );

      if (rows.length === 0) {
        return NextResponse.json(
          { error: "No words found in the selected chapters." },
          { status: 400 }
        );
      }

      const sampled =
        rows.length > 30
          ? [...rows].sort(() => Math.random() - 0.5).slice(0, 30)
          : rows;

      const wordList = sampled
        .map(
          (w) =>
            `- ${w.mainWord} — ${w.translation1 ?? ""}${w.translation2 ? ` / ${w.translation2}` : ""}${w.exampleSentence ? ` | ex: ${w.exampleSentence}` : ""}`
        )
        .join("\n");

      const userPrompt = `Generate a vocabulary quiz for a learner of ${mainLang} (their first language is ${learnerLang}).

Write prompts and explanations in ${learnerLang}. The target words and example sentences should be in ${mainLang}.

Words to practice (target — primary translation / secondary translation | example):
${wordList}

Generate ${QUIZ_QUESTION_COUNT} questions following the JSON format. Focus on meaning, common usage, and (for nouns) gender/articles.`;

      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ];

      meta = { mode: "vocabulary", sections: parsed.sections };
    } else {
      const filename = `${parsed.level}_Lesson.md`;
      const filepath = path.join(
        process.cwd(),
        "src",
        "assets",
        "lessons",
        filename
      );
      let raw: string;
      try {
        raw = await fs.readFile(filepath, "utf8");
      } catch {
        return NextResponse.json(
          { error: `Lesson for ${parsed.level} is not available.` },
          { status: 400 }
        );
      }

      const lessonText = parsed.full
        ? raw
        : sliceLessonByTopicIds(raw, parsed.topicIds ?? []);
      const trimmed =
        lessonText.length > 14000 ? lessonText.slice(0, 14000) : lessonText;

      const focusNote = parsed.full
        ? "Cover the lesson broadly."
        : "Focus on the topic sections shown below.";

      const userPrompt = `Generate a ${parsed.level} grammar quiz for a learner of ${mainLang} (first language: ${learnerLang}).

Write prompts and explanations in ${learnerLang}. Example sentences should be in ${mainLang}.

${focusNote}

Lesson content:
"""
${trimmed}
"""

Generate ${QUIZ_QUESTION_COUNT} questions following the JSON format. Test rule comprehension, application in a sentence, and common mistakes.`;

      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ];

      meta = {
        mode: "grammar",
        level: parsed.level,
        topicIds: parsed.topicIds,
        full: parsed.full,
      };
    }

    const rawJson = await callAI(messages);
    const validated = aiResponseSchema.safeParse(rawJson);

    if (!validated.success) {
      console.error(
        "[QUIZ_GEN] AI response invalid",
        validated.error.errors,
        rawJson
      );
      return NextResponse.json(
        { error: "AI returned an invalid quiz. Try again." },
        { status: 502 }
      );
    }

    const quiz = {
      id: crypto.randomUUID(),
      meta,
      questions: validated.data.questions,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(quiz);
  } catch (error) {
    console.error("[QUIZ_GEN]", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", details: error.errors },
        { status: 400 }
      );
    }
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
