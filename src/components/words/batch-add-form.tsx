"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Sparkles } from "lucide-react";
import { parseBatchWords, buildGlossarFormatPrompt } from "@/lib/languages";
import type { UserLanguagePreferences } from "@/lib/languages";

// Define the form schema
const formSchema = z.object({
  pattern: z.literal("default"),  // Only one pattern for now
  words: z.string().min(1, "Please enter some words"),
  section: z.string().min(1, "Section is required"),
});

type FormValues = z.infer<typeof formSchema>;

interface ParsedWord {
  mainWord: string;
  translation2: string;
  translation1: string;
  exampleSentence: string | null;
  section: string;
}

export function BatchAddForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedWords, setParsedWords] = useState<ParsedWord[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [isFormatting, setIsFormatting] = useState(false);
  const [section, setSection] = useState("");
  const [languagePrefs, setLanguagePrefs] = useState<UserLanguagePreferences | null>(null);
  const promptRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const fetchLanguagePreferences = async () => {
      try {
        const response = await fetch("/api/user/languages");
        if (response.ok) {
          const data = await response.json();
          setLanguagePrefs(data);
        }
      } catch (error) {
        console.error("Failed to fetch language preferences:", error);
        setLanguagePrefs({
          mainLanguage: "German",
          translationLanguages: ["English", "Bangla"]
        });
      }
    };
    fetchLanguagePreferences();
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      pattern: "default",
      words: "",
      section: "",
    },
  });

  const pattern = "default";

  const parseWords = (text: string) => {
    if (!languagePrefs) return;

    const result = parseBatchWords(text, pattern, form.getValues("section"), languagePrefs);

    if (result.errors.length > 0) {
      setParseError(result.errors.join("\n"));
      setParsedWords([]);
    } else {
      setParsedWords(result.words as ParsedWord[]);
    }
  };

  const handleAIFormat = async () => {
    const text = aiInput.trim();
    if (!text) {
      toast.error("Paste some words to format first.");
      return;
    }

    try {
      setIsFormatting(true);
      const response = await fetch("/api/words/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to format words");
      }

      const formatted: string = result.formatted ?? "";
      if (!formatted.trim()) {
        throw new Error("AI returned no formatted words. Try again.");
      }

      // Drop the result into the manual textarea so the user can review/edit
      form.setValue("words", formatted, { shouldValidate: true });
      parseWords(formatted);
      toast.success("Formatted with AI. Please review the result below before adding.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to format words. Please try again."
      );
    } finally {
      setIsFormatting(false);
    }
  };

  const onSubmit = async (data: FormValues) => {
    if (!languagePrefs) {
      toast.error("Loading language preferences...");
      return;
    }

    if (parsedWords.length === 0) {
      parseWords(data.words);
      if (parsedWords.length === 0) {
        return;
      }
    }

    try {
      setIsAdding(true);
      // Prepare words with all fields including example sentence
      const wordsToSubmit = parsedWords.map((word) => ({
        mainWord: word.mainWord,
        translation2: word.translation2,
        translation1: word.translation1,
        exampleSentence: word.exampleSentence,
        section: word.section
      }));

      const response = await fetch("/api/words/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: wordsToSubmit }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to add words");
      }

      toast.success(data.message || `Added ${parsedWords.length} words to section ${data.section}`);
      form.reset({
        pattern: "default",
        words: "",
        section: "",
      });
      setSection("");
      setAiInput("");
      setParsedWords([]);
      setParseError(null);

      // Refresh the word list
      await queryClient.invalidateQueries({ queryKey: ["words"] });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add words. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleCopyPrompt = () => {
    if (promptRef.current) {
      const text = promptRef.current.innerText;
      navigator.clipboard.writeText(text);
      toast.success("Prompt copied to clipboard!");
    }
  };

  // Sync section state with form
  const handleSectionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSection(value);
    form.setValue("section", value, { shouldValidate: true });
    // Re-parse words to update preview
    parseWords(form.getValues("words"));
  };

  if (!languagePrefs) {
    return <div>Loading language preferences...</div>;
  }

  const getExampleFormat = () => {
    const lang1 = languagePrefs.translationLanguages[0] || "Language 1";
    const lang2 = languagePrefs.translationLanguages[1] || "Language 2";
    return `"${languagePrefs.mainLanguage}","${lang2}","${lang1}","Example sentence"`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch Add Words</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="relative">
              Enter words with their translations in the following CSV format (one per line):
              <br />
              <br />
              <code className="text-sm">{getExampleFormat()}</code>
              <br /><br />
              Example: "das Haus","বাড়ি","house","Das Haus ist groß."
              <br /><br />
              Prompt:
              <br />
              <span ref={promptRef} className="block whitespace-pre-line">
                {buildGlossarFormatPrompt(languagePrefs)}
              </span>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="absolute top-0 right-0 p-1 bg-white rounded hover:bg-gray-100 border border-gray-200"
                aria-label="Copy prompt"
                tabIndex={0}
              >
                <Copy className="h-4 w-4 text-gray-500" />
              </button>
            </AlertDescription>
          </Alert>

          <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <Label htmlFor="ai-input" className="font-medium">
                Format with AI
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Paste raw words from your Glossar (one per line, any format — no quotes or
              commas needed). AI will translate and format them, then fill the box below so
              you can review before adding.
            </p>
            <Textarea
              id="ai-input"
              placeholder={`Paste raw words, e.g.:\ndas Haus\ngünstig\nguten Tag`}
              className="font-mono"
              rows={5}
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              disabled={isFormatting}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleAIFormat}
              disabled={isFormatting || !aiInput.trim()}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {isFormatting ? "Formatting..." : "Format with AI"}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="words">Words</Label>
            <Textarea
              id="words"
              placeholder={`Enter words in format: ${getExampleFormat()}\nExample:\n"das Haus","বাড়ি","house","Das Haus ist groß."`}
              className="font-mono"
              rows={6}
              {...form.register("words", {
                onChange: (e) => parseWords(e.target.value),
              })}
            />
            <p className="text-sm text-muted-foreground">
              One word per line. Wrap each field in double quotes and separate with commas. Sentence is optional.
            </p>
          </div>

          {parseError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="whitespace-pre-wrap">
                {parseError}
              </AlertDescription>
            </Alert>
          )}

          {parsedWords.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <div className="grid grid-cols-5 gap-4 p-4 font-medium border-b">
                    <div>{languagePrefs.mainLanguage}</div>
                    <div>{languagePrefs.translationLanguages[1] || "Language 2"}</div>
                    <div>{languagePrefs.translationLanguages[0] || "Language 1"}</div>
                    <div>Example</div>
                    <div>Section</div>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {parsedWords.map((word, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-5 gap-4 p-4 border-b last:border-0"
                      >
                        <div>{word.mainWord}</div>
                        <div>{word.translation2}</div>
                        <div>{word.translation1}</div>
                        <div>{word.exampleSentence || "-"}</div>
                        <div>{word.section}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-4">
            <div className="w-32">
              <Label htmlFor="section" className="sr-only">Section Number</Label>
              <Input
                id="section"
                type="text"
                value={section}
                onChange={handleSectionChange}
                placeholder="Section #"
              />
            </div>
            <Button type="submit" disabled={isAdding || parsedWords.length === 0 || !section}>
              {isAdding ? "Adding..." : `Add ${parsedWords.length} Words`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}