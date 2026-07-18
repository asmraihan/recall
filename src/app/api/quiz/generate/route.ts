// Requires env:
//   GEMINI_API_KEY=...            (required) — Google AI Studio API key (free tier)
//   GEMINI_MODEL=...              (optional, defaults to gemini-flash-latest)
//
// Get a free key at https://aistudio.google.com/app/apikey

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

const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// Exam-style guidance per CEFR level, used to shape questions after the
// format, topics, and grammar scope of the Goethe-Zertifikat / telc exams.
const EXAM_STYLE: Record<string, string> = {
  A1: `Model the questions on the Goethe-Zertifikat A1 (Start Deutsch 1) and telc Deutsch A1 exams:
- Everyday topics: greetings, family, shopping, food, time and dates, home, daily routine.
- Grammar scope: present tense, articles (der/die/das, ein/kein), personal pronouns, W-questions, basic main-clause word order, common prepositions, plurals, numbers.
- Keep sentences short and concrete; stay strictly within A1 vocabulary.`,
  A2: `Model the questions on the Goethe-Zertifikat A2 and telc Deutsch A2 exams:
- Topics: work, travel, health, appointments, leisure, past experiences.
- Grammar scope: Perfekt and Präteritum of common verbs, modal verbs, dative/accusative cases and prepositions, comparatives and superlatives, separable verbs, subordinate clauses with weil/dass/wenn.
- Slightly longer sentences in a practical, everyday register.`,
  B1: `Model the questions on the Goethe-Zertifikat B1 and telc Deutsch B1 exams:
- Topics: opinions, plans, environment, media, relationships, and other everyday abstract matters.
- Grammar scope: Konjunktiv II, passive voice, relative clauses, Genitiv, adjective declension, connectors (deshalb, trotzdem, obwohl, deswegen) and two-part connectors (entweder…oder, je…desto).
- Use connected discourse and reasoning; the register may be more nuanced.`,
};

const LEVEL_BY_SECTION_PREFIX: Record<string, string> = {
  "1": "A1",
  "2": "A2",
  "3": "B1",
};

// Derive a CEFR level from a section code like "1 01" (→ A1), "2 03" (→ A2).
function levelFromSection(section: string): string | null {
  const m = section.match(/^(\d+)\s+0*\d+$/);
  if (!m) return null;
  return LEVEL_BY_SECTION_PREFIX[m[1]] ?? null;
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1].trim() : trimmed;
}

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

const SYSTEM_PROMPT = `You are an examiner who writes German-language quizzes in the style of standardized CEFR exams (Goethe-Zertifikat and telc).

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
- Mix types to mirror exam task formats: roughly 3 true_false (Richtig/Falsch), 4 multiple_choice, 3 fill_blank (Lückentext).
- Keep the tested material (sentences, texts, the blank's context) in the target language; short task instructions and explanations may be in the learner's language.
- All distractors in multiple_choice must be plausible (same word class / similar register) — the kind an exam candidate could realistically confuse.
- For fill_blank: the surrounding context must make the answer unambiguous; the answer is a single word.
- Match the topics, difficulty, and grammar scope of the requested exam level exactly — do not exceed it.
- Test understanding, usage, and common exam pitfalls — never trivia.
- Keep explanations concise and instructive.`;

async function callAI(
  systemPrompt: string,
  userPrompt: string
): Promise<unknown> {
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
        temperature: 0.7,
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        // gemini-flash-latest resolves to a thinking model; without this it
        // spends the output budget on internal reasoning and can return empty
        // or truncated JSON. Quiz generation doesn't need extended thinking.
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
    const reason = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason;
    throw new Error(`AI response empty${reason ? ` (${reason})` : ""}`);
  }
  return JSON.parse(stripJsonFences(content));
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
            "GEMINI_API_KEY is not configured. Add it to your environment to enable AI quizzes.",
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

    let userPrompt: string;
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

      const level =
        parsed.sections.map(levelFromSection).find((l): l is string => l != null) ?? null;
      const examNote = level
        ? `\nTarget exam level: ${level}.\n${EXAM_STYLE[level]}\n`
        : "";

      userPrompt = `Generate a vocabulary quiz for a learner of ${mainLang} (their first language is ${learnerLang}).
${examNote}
Write task instructions and explanations in ${learnerLang}. The target words and example sentences must be in ${mainLang}.

Words to practice (target — primary translation / secondary translation | example):
${wordList}

Generate ${QUIZ_QUESTION_COUNT} questions following the JSON format. Focus on meaning, common usage, and (for nouns) gender/articles, in the style of the exam described above.`;

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

      userPrompt = `Generate a ${parsed.level} grammar quiz for a learner of ${mainLang} (first language: ${learnerLang}).

Target exam level: ${parsed.level}.
${EXAM_STYLE[parsed.level]}

Write task instructions and explanations in ${learnerLang}. Example sentences and the tested material must be in ${mainLang}.

${focusNote}

Lesson content:
"""
${trimmed}
"""

Generate ${QUIZ_QUESTION_COUNT} questions following the JSON format. Test rule comprehension, application in a sentence, and common mistakes, in the style of the exam described above.`;

      meta = {
        mode: "grammar",
        level: parsed.level,
        topicIds: parsed.topicIds,
        full: parsed.full,
      };
    }

    const rawJson = await callAI(SYSTEM_PROMPT, userPrompt);
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
