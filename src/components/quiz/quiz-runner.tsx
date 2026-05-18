"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Loader2, Check, X, RotateCw, Astroid } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type Quiz,
  type QuizAttempt,
  type UserAnswer,
  type Question,
  sectionLabel,
  isAnswerCorrect,
  calculateScore,
} from "@/lib/quiz";
import { loadAttempt, saveAttempt, clearAttempt } from "@/lib/quiz-storage";

interface SectionOption {
  value: string;
  count: number;
}

interface LessonOption {
  level: string;
  title: string;
  sections: { id: string; text: string; depth: number }[];
}

interface QuizRunnerProps {
  sections: SectionOption[];
  lessons: LessonOption[];
}

type Phase =
  | { phase: "setup" }
  | { phase: "generating" }
  | { phase: "playing"; attempt: QuizAttempt }
  | { phase: "results"; attempt: QuizAttempt };

export function QuizRunner({ sections, lessons }: QuizRunnerProps) {
  const [phase, setPhase] = useState<Phase>({ phase: "setup" });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const existing = loadAttempt();
    if (existing) {
      if (existing.completedAt) {
        setPhase({ phase: "results", attempt: existing });
      } else {
        setPhase({ phase: "playing", attempt: existing });
      }
    }
    setHydrated(true);
  }, []);

  async function handleGenerate(req: object) {
    setPhase({ phase: "generating" });
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      const quiz: Quiz = await res.json();
      const attempt: QuizAttempt = {
        quiz,
        answers: new Array(quiz.questions.length).fill(null),
        currentIndex: 0,
        completedAt: null,
      };
      saveAttempt(attempt);
      setPhase({ phase: "playing", attempt });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate quiz");
      setPhase({ phase: "setup" });
    }
  }

  function handleAnswer(idx: number, answer: UserAnswer) {
    setPhase((p) => {
      if (p.phase !== "playing") return p;
      const newAnswers = [...p.attempt.answers];
      newAnswers[idx] = answer;
      const attempt = { ...p.attempt, answers: newAnswers };
      saveAttempt(attempt);
      return { phase: "playing", attempt };
    });
  }

  function handleNext() {
    setPhase((p) => {
      if (p.phase !== "playing") return p;
      const { attempt } = p;
      if (attempt.currentIndex < attempt.quiz.questions.length - 1) {
        const next = { ...attempt, currentIndex: attempt.currentIndex + 1 };
        saveAttempt(next);
        return { phase: "playing", attempt: next };
      }
      const completed = { ...attempt, completedAt: new Date().toISOString() };
      saveAttempt(completed);
      return { phase: "results", attempt: completed };
    });
  }

  function handlePrev() {
    setPhase((p) => {
      if (p.phase !== "playing") return p;
      if (p.attempt.currentIndex === 0) return p;
      const next = { ...p.attempt, currentIndex: p.attempt.currentIndex - 1 };
      saveAttempt(next);
      return { phase: "playing", attempt: next };
    });
  }

  function handleSkip() {
    setPhase((p) => {
      if (p.phase !== "playing") return p;
      const newAnswers = [...p.attempt.answers];
      newAnswers[p.attempt.currentIndex] = null;
      const attempt = { ...p.attempt, answers: newAnswers };

      if (attempt.currentIndex < attempt.quiz.questions.length - 1) {
        const next = { ...attempt, currentIndex: attempt.currentIndex + 1 };
        saveAttempt(next);
        return { phase: "playing", attempt: next };
      }
      const completed = { ...attempt, completedAt: new Date().toISOString() };
      saveAttempt(completed);
      return { phase: "results", attempt: completed };
    });
  }

  function handleNewQuiz() {
    clearAttempt();
    setPhase({ phase: "setup" });
  }

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (phase.phase === "generating") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-sm">Generating your quiz…</div>
          <div className="text-xs text-muted-foreground">
            This may take 10–20 seconds.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (phase.phase === "playing") {
    return (
      <QuizPlayer
        attempt={phase.attempt}
        onAnswer={handleAnswer}
        onNext={handleNext}
        onPrev={handlePrev}
        onSkip={handleSkip}
        onAbort={handleNewQuiz}
      />
    );
  }

  if (phase.phase === "results") {
    return <QuizResults attempt={phase.attempt} onNewQuiz={handleNewQuiz} />;
  }

  return (
    <QuizSetup
      sections={sections}
      lessons={lessons}
      onGenerate={handleGenerate}
    />
  );
}

function QuizSetup({
  sections,
  lessons,
  onGenerate,
}: {
  sections: SectionOption[];
  lessons: LessonOption[];
  onGenerate: (req: object) => void;
}) {
  const [tab, setTab] = useState<"vocabulary" | "grammar">("vocabulary");
  const [selectedSections, setSelectedSections] = useState<Set<string>>(
    new Set()
  );
  const [grammarLevel, setGrammarLevel] = useState<string>(
    lessons[0]?.level ?? ""
  );
  const [grammarScope, setGrammarScope] = useState<"full" | "topics">("topics");
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());

  const currentLesson = lessons.find((l) => l.level === grammarLevel);

  const canVocab = selectedSections.size > 0;
  const canGrammar =
    !!grammarLevel &&
    (grammarScope === "full" || selectedTopics.size > 0);

  function toggleSection(s: string) {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleTopic(id: string) {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a Quiz</CardTitle>
        <CardDescription>
          Choose how you want to practice. 10 questions, AI-generated.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "vocabulary" | "grammar")}>
          <TabsList className="mb-4">
            <TabsTrigger value="vocabulary">Vocabulary</TabsTrigger>
            <TabsTrigger value="grammar">Grammar</TabsTrigger>
          </TabsList>

          <TabsContent value="vocabulary" className="space-y-4">
            <div className="space-y-2">
              <Label>Select one or more chapters</Label>
              {sections.length === 0 ? (
                <div className="text-sm text-muted-foreground py-2">
                  You haven&apos;t added any words yet.
                </div>
              ) : (
                <div className="grid gap-1 max-h-80 overflow-y-auto rounded-md border p-2">
                  {sections.map((s) => {
                    const checked = selectedSections.has(s.value);
                    return (
                      <label
                        key={s.value}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleSection(s.value)}
                        />
                        <span className="text-sm flex-1">
                          {sectionLabel(s.value)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {s.count} words
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <Button
              onClick={() =>
                onGenerate({
                  mode: "vocabulary",
                  sections: Array.from(selectedSections),
                })
              }
              disabled={!canVocab}
              className="w-full"
            >
              <Astroid className="h-4 w-4 mr-2" />
              Generate Quiz
            </Button>
          </TabsContent>

          <TabsContent value="grammar" className="space-y-4">
            {lessons.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">
                No grammar lessons available.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Level</Label>
                  <div className="flex gap-2 flex-wrap">
                    {lessons.map((l) => (
                      <button
                        key={l.level}
                        type="button"
                        onClick={() => {
                          setGrammarLevel(l.level);
                          setSelectedTopics(new Set());
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-md text-sm border transition-colors",
                          grammarLevel === l.level
                            ? "bg-primary text-primary-foreground border-primary"
                            : "hover:bg-muted/50"
                        )}
                      >
                        {l.level}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Scope</Label>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { key: "topics", label: "Specific topics" },
                      { key: "full", label: "Full lesson" },
                    ] as const).map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setGrammarScope(s.key)}
                        className={cn(
                          "px-3 py-1.5 rounded-md text-sm border transition-colors",
                          grammarScope === s.key
                            ? "bg-primary text-primary-foreground border-primary"
                            : "hover:bg-muted/50"
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {grammarScope === "topics" && currentLesson && (
                  <div className="space-y-2">
                    <Label>
                      Topics{" "}
                      <span className="text-muted-foreground font-normal">
                        ({selectedTopics.size} selected)
                      </span>
                    </Label>
                    {currentLesson.sections.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-2">
                        No topics found in this lesson.
                      </div>
                    ) : (
                      <div className="grid gap-1 max-h-80 overflow-y-auto rounded-md border p-2">
                        {currentLesson.sections.map((t) => (
                          <label
                            key={t.id}
                            className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedTopics.has(t.id)}
                              onCheckedChange={() => toggleTopic(t.id)}
                              className="mt-0.5"
                            />
                            <span className="text-sm flex-1">{t.text}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <Button
                  onClick={() =>
                    onGenerate({
                      mode: "grammar",
                      level: grammarLevel,
                      full: grammarScope === "full",
                      topicIds:
                        grammarScope === "full"
                          ? []
                          : Array.from(selectedTopics),
                    })
                  }
                  disabled={!canGrammar}
                  className="w-full"
                >
                  <Astroid  className="h-4 w-4 mr-2" />
                  Generate Quiz
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function QuizPlayer({
  attempt,
  onAnswer,
  onNext,
  onPrev,
  onSkip,
  onAbort,
}: {
  attempt: QuizAttempt;
  onAnswer: (idx: number, ans: UserAnswer) => void;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onAbort: () => void;
}) {
  const { quiz, currentIndex, answers } = attempt;
  const question = quiz.questions[currentIndex];
  const currentAnswer = answers[currentIndex];
  const isLast = currentIndex === quiz.questions.length - 1;
  const progress = ((currentIndex + 1) / quiz.questions.length) * 100;

  const hasAnswer =
    currentAnswer !== null &&
    !(currentAnswer.type === "fill_blank" && !currentAnswer.value.trim());

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Question {currentIndex + 1} of {quiz.questions.length}
            </CardTitle>
            <span className="text-xs text-muted-foreground capitalize">
              {question.type.replace("_", " ")}
            </span>
          </div>
          <Progress value={progress} className="h-1" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-base font-medium leading-relaxed whitespace-pre-wrap">
            {question.prompt}
          </div>

          {question.type === "true_false" && (
            <TrueFalseInput
              value={
                currentAnswer && currentAnswer.type === "true_false"
                  ? currentAnswer.value
                  : null
              }
              onChange={(v) =>
                onAnswer(currentIndex, { type: "true_false", value: v })
              }
            />
          )}
          {question.type === "multiple_choice" && (
            <MultipleChoiceInput
              options={question.options}
              value={
                currentAnswer && currentAnswer.type === "multiple_choice"
                  ? currentAnswer.value
                  : null
              }
              onChange={(v) =>
                onAnswer(currentIndex, { type: "multiple_choice", value: v })
              }
            />
          )}
          {question.type === "fill_blank" && (
            <FillBlankInput
              value={
                currentAnswer && currentAnswer.type === "fill_blank"
                  ? currentAnswer.value
                  : ""
              }
              onChange={(v) =>
                onAnswer(currentIndex, { type: "fill_blank", value: v })
              }
              onSubmit={() => {
                if (hasAnswer) onNext();
              }}
            />
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onPrev}
              disabled={currentIndex === 0}
            >
              Previous
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onSkip}>
                Skip
              </Button>
              <Button onClick={onNext} disabled={!hasAnswer}>
                {isLast ? "Finish" : "Next"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={onAbort}
          className="text-muted-foreground"
        >
          Abandon quiz
        </Button>
      </div>
    </div>
  );
}

function TrueFalseInput({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(
        [
          { val: true, label: "True" },
          { val: false, label: "False" },
        ] as const
      ).map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => onChange(opt.val)}
          className={cn(
            "rounded-md border py-3 text-sm font-medium transition-colors",
            value === opt.val
              ? "bg-primary text-primary-foreground border-primary"
              : "hover:bg-muted/50"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function MultipleChoiceInput({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid gap-2">
      {options.map((opt, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className={cn(
            "rounded-md border px-3 py-2.5 text-sm text-left transition-colors",
            value === i
              ? "bg-primary text-primary-foreground border-primary"
              : "hover:bg-muted/50"
          )}
        >
          <span className="font-medium mr-2">
            {String.fromCharCode(65 + i)}.
          </span>
          {opt}
        </button>
      ))}
    </div>
  );
}

function FillBlankInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Input
      autoFocus
      placeholder="Type your answer…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value.trim()) {
          e.preventDefault();
          onSubmit();
        }
      }}
      className="text-base"
    />
  );
}

function QuizResults({
  attempt,
  onNewQuiz,
}: {
  attempt: QuizAttempt;
  onNewQuiz: () => void;
}) {
  const { correct, total } = calculateScore(attempt);
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>
            Review your answers and explanations below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <div className="text-4xl font-bold leading-none">
                {correct}
                <span className="text-2xl text-muted-foreground">/{total}</span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {percent}% correct
              </div>
            </div>
            <div className="flex-1" />
            <Button onClick={onNewQuiz}>
              <RotateCw className="h-4 w-4 mr-2" />
              New Quiz
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {attempt.quiz.questions.map((q, i) => (
          <QuestionReview
            key={i}
            index={i}
            question={q}
            userAnswer={attempt.answers[i]}
          />
        ))}
      </div>
    </div>
  );
}

function QuestionReview({
  index,
  question,
  userAnswer,
}: {
  index: number;
  question: Question;
  userAnswer: UserAnswer | null;
}) {
  const correct = isAnswerCorrect(question, userAnswer);

  return (
    <Card
      className={cn(
        "border-l-4",
        correct ? "border-l-green-500" : "border-l-destructive"
      )}
    >
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start gap-2">
          <div className="text-xs font-medium text-muted-foreground mt-0.5">
            Q{index + 1}
          </div>
          <div className="flex-1 text-sm font-medium leading-relaxed whitespace-pre-wrap">
            {question.prompt}
          </div>
          {correct ? (
            <Check className="h-5 w-5 text-green-500 shrink-0" />
          ) : (
            <X className="h-5 w-5 text-destructive shrink-0" />
          )}
        </div>

        <div className="ml-8 text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">Your answer: </span>
            <span
              className={cn(
                correct
                  ? "text-green-600 dark:text-green-400"
                  : "text-destructive"
              )}
            >
              {formatUserAnswer(question, userAnswer)}
            </span>
          </div>
          {!correct && (
            <div>
              <span className="text-muted-foreground">Correct: </span>
              <span className="text-green-600 dark:text-green-400">
                {formatCorrectAnswer(question)}
              </span>
            </div>
          )}
          <div className="text-muted-foreground italic pt-1 mt-2 border-t border-border/50">
            {question.explanation}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatUserAnswer(q: Question, a: UserAnswer | null): string {
  if (!a) return "(no answer)";
  if (a.type === "true_false") return a.value ? "True" : "False";
  if (a.type === "multiple_choice") {
    if (q.type !== "multiple_choice") return "?";
    return q.options[a.value] ?? "(invalid)";
  }
  if (a.type === "fill_blank") return a.value || "(empty)";
  return "?";
}

function formatCorrectAnswer(q: Question): string {
  if (q.type === "true_false") return q.answer ? "True" : "False";
  if (q.type === "multiple_choice") return q.options[q.answerIndex];
  if (q.type === "fill_blank") return q.answer;
  return "?";
}
