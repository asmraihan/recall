import { z } from "zod";

export const QUIZ_QUESTION_COUNT = 10;

const trueFalseSchema = z.object({
  type: z.literal("true_false"),
  prompt: z.string(),
  answer: z.boolean(),
  explanation: z.string(),
});

const multipleChoiceSchema = z.object({
  type: z.literal("multiple_choice"),
  prompt: z.string(),
  options: z.array(z.string()).min(2).max(6),
  answerIndex: z.number().int().nonnegative(),
  explanation: z.string(),
});

const fillBlankSchema = z.object({
  type: z.literal("fill_blank"),
  prompt: z.string(),
  answer: z.string(),
  acceptableAnswers: z.array(z.string()).optional(),
  explanation: z.string(),
});

export const questionSchema = z.discriminatedUnion("type", [
  trueFalseSchema,
  multipleChoiceSchema,
  fillBlankSchema,
]);

export const aiResponseSchema = z.object({
  questions: z.array(questionSchema).min(1).max(20),
});

export type Question = z.infer<typeof questionSchema>;
export type TrueFalseQuestion = z.infer<typeof trueFalseSchema>;
export type MultipleChoiceQuestion = z.infer<typeof multipleChoiceSchema>;
export type FillBlankQuestion = z.infer<typeof fillBlankSchema>;

export type UserAnswer =
  | { type: "true_false"; value: boolean }
  | { type: "multiple_choice"; value: number }
  | { type: "fill_blank"; value: string };

export interface QuizMeta {
  mode: "vocabulary" | "grammar";
  sections?: string[];
  level?: string;
  topicIds?: string[];
  full?: boolean;
}

export interface Quiz {
  id: string;
  meta: QuizMeta;
  questions: Question[];
  createdAt: string;
}

export interface QuizAttempt {
  quiz: Quiz;
  answers: (UserAnswer | null)[];
  currentIndex: number;
  completedAt: string | null;
}

export function isAnswerCorrect(q: Question, a: UserAnswer | null): boolean {
  if (!a || a.type !== q.type) return false;
  if (q.type === "true_false" && a.type === "true_false") {
    return q.answer === a.value;
  }
  if (q.type === "multiple_choice" && a.type === "multiple_choice") {
    return q.answerIndex === a.value;
  }
  if (q.type === "fill_blank" && a.type === "fill_blank") {
    const userVal = a.value.trim().toLowerCase();
    const candidates = [q.answer, ...(q.acceptableAnswers ?? [])].map((s) =>
      s.trim().toLowerCase()
    );
    return candidates.includes(userVal);
  }
  return false;
}

export function calculateScore(attempt: QuizAttempt) {
  const total = attempt.quiz.questions.length;
  const correct = attempt.quiz.questions.reduce(
    (n, q, i) => (isAnswerCorrect(q, attempt.answers[i]) ? n + 1 : n),
    0
  );
  return { correct, total };
}

export function sectionLabel(section: string): string {
  const m = section.match(/^(\d+)\s+0*(\d+)$/);
  if (!m) return section;
  const levelMap: Record<string, string> = { "1": "A1", "2": "A2", "3": "B1" };
  const level = levelMap[m[1]] ?? `Book ${m[1]}`;
  return `${level} · Chapter ${m[2]}`;
}
