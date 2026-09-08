"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  CheckCircle2,
  Languages,
  Loader2,
  RefreshCw,
  Star,
  Trophy,
  Volume2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation-cache";

export interface SummaryWord {
  id: string;
  mainWord: string;
  translation1: string | null;
  translation2: string | null;
  section: string;
  notes: string | null;
  important?: boolean;
  exampleSentence: string | null;
}

interface SessionSummaryProps {
  correctCount: number;
  incorrectCount: number;
  mistakes: SummaryWord[];
  sessionType: string;
  isImportant: (word: SummaryWord) => boolean;
  onToggleImportant: (word: SummaryWord) => void;
  onPlayTTS: (text: string) => void;
  ttsLoading: boolean;
  onPracticeMistakes: () => void;
  isStartingMistakes: boolean;
  onBackToLearn: () => void;
}

/** Builds TTS text without the literal "null" the card view speaks. */
function ttsTextFor(word: SummaryWord) {
  return [word.mainWord, word.exampleSentence].filter(Boolean).join(". ");
}

function MistakeRow({
  word,
  index,
  isImportant,
  onToggleImportant,
  onPlayTTS,
  ttsLoading,
}: {
  word: SummaryWord;
  index: number;
  isImportant: boolean;
  onToggleImportant: (word: SummaryWord) => void;
  onPlayTTS: (text: string) => void;
  ttsLoading: boolean;
}) {
  const [showTranslation, setShowTranslation] = useState(false);

  // Passing null keeps this lazy — nothing is fetched until the translate icon
  // is used, so a long mistake list costs no translation calls on mount.
  const { translation, loading: translationLoading } = useTranslation(
    showTranslation ? word.exampleSentence : null,
    { targetLanguage: "en" }
  );

  const translations = [word.translation1, word.translation2].filter(Boolean) as string[];

  return (
    <TableRow className="align-top ">
      <TableCell className="py-2.5 whitespace-nowrap text-sm tabular-nums text-muted-foreground pl-6">
        {index + 1}
      </TableCell>

      <TableCell className="py-2.5 font-medium whitespace-normal break-words ">
        {word.mainWord}
        {word.notes && (
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            {word.notes}
          </span>
        )}
      </TableCell>

      <TableCell className="py-2.5 whitespace-normal break-words text-muted-foreground">
        {translations.length > 0 ? translations.join("  ·  ") : "—"}
      </TableCell>

      <TableCell className="py-2.5 whitespace-normal break-words">
        {word.exampleSentence ? (
          <>
            <span className="italic">{word.exampleSentence}</span>
            {showTranslation &&
              (translationLoading ? (
                <span className="mt-0.5 block text-xs text-muted-foreground/70">
                  Translating…
                </span>
              ) : (
                translation && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {translation}
                  </span>
                )
              ))}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="py-2.5 whitespace-nowrap text-right">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={showTranslation ? "Hide sentence translation" : "Translate sentence"}
          aria-pressed={showTranslation}
          disabled={!word.exampleSentence}
          onClick={() => setShowTranslation((shown) => !shown)}
        >
          <Languages
            className={cn(
              "h-4 w-4",
              showTranslation ? "text-primary" : "text-muted-foreground"
            )}
          />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={isImportant ? "Unmark as important" : "Mark as important"}
          onClick={() => onToggleImportant(word)}
        >
          <Star
            className={cn(
              "h-4 w-4",
              isImportant ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
            )}
          />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Play pronunciation of ${word.mainWord}`}
          disabled={ttsLoading}
          onClick={() => onPlayTTS(ttsTextFor(word))}
        >
          <Volume2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function SessionSummary({
  correctCount,
  incorrectCount,
  mistakes,
  sessionType,
  isImportant,
  onToggleImportant,
  onPlayTTS,
  ttsLoading,
  onPracticeMistakes,
  isStartingMistakes,
  onBackToLearn,
}: SessionSummaryProps) {
  const total = correctCount + incorrectCount;
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const isPerfect = incorrectCount === 0 && total > 0;

  const readableType = sessionType
    ? sessionType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Learning";

  return (
    <div className="w-full space-y-4">
      {/* Score + actions in one compact block */}
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                isPerfect ? "bg-yellow-400/15 text-yellow-500" : "bg-primary/10 text-primary"
              )}
            >
              <Trophy className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">
                Session complete
              </h1>
              <p className="text-sm text-muted-foreground">
                {readableType} · {total} {total === 1 ? "word" : "words"}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                {correctCount}
              </span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                <XCircle className="h-4 w-4" />
                {incorrectCount}
              </span>
              <span className="text-2xl font-bold tabular-nums">{accuracy}%</span>
            </div>
          </div>

          <Progress value={accuracy} className="h-1.5" />

          <div className="flex flex-wrap gap-2 pt-1">
            {mistakes.length > 0 && (
              <Button size="sm" onClick={onPracticeMistakes} disabled={isStartingMistakes}>
                {isStartingMistakes ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Practice {mistakes.length} {mistakes.length === 1 ? "mistake" : "mistakes"}
              </Button>
            )}
            <Button
              size="sm"
              variant={mistakes.length > 0 ? "outline" : "default"}
              onClick={onBackToLearn}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Learn
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mistakes */}
      {mistakes.length > 0 ? (
        <Card className="p-0">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Words to review</h2>
              <Badge variant="secondary">{mistakes.length}</Badge>
            </div>

            <Table >
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[3%] pl-6">#</TableHead>
                  <TableHead className="w-[22%]">Word</TableHead>
                  <TableHead className="w-[22%]">Meaning</TableHead>
                  <TableHead>Example</TableHead>
                  <TableHead className="w-[3%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mistakes.map((word, index) => (
                  <MistakeRow
                    key={word.id}
                    word={word}
                    index={index}
                    isImportant={isImportant(word)}
                    onToggleImportant={onToggleImportant}
                    onPlayTTS={onPlayTTS}
                    ttsLoading={ttsLoading}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        total > 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-1.5 p-6 text-center">
              <Trophy className="h-7 w-7 text-yellow-500" />
              <p className="font-semibold">Perfect session</p>
              <p className="text-sm text-muted-foreground">
                You got every word right. Nothing to review.
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
