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
import { Copy } from "lucide-react";
import { parseBatchWords } from "@/lib/languages";
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
    return `${languagePrefs.mainLanguage} word-${lang2} translation-${lang1} translation-Example sentence`;
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
              Enter words with their translations in the following format:
              <br />
              <br />
              <code className="text-sm">{getExampleFormat()}</code>
              <br /><br />
              Example: das Haus-বাড়ি-house-Das Haus ist groß
              <br /><br />
              Prompt: {" "}
              <span>"</span>
              <span ref={promptRef} className="">
                Give me translation list of {languagePrefs.mainLanguage} words followed by {languagePrefs.translationLanguages[1]} and {languagePrefs.translationLanguages[0]} translations in this exact format: {languagePrefs.mainLanguage}-{languagePrefs.translationLanguages[1]}-{languagePrefs.translationLanguages[0]}-Example Sentence. Use three hyphens (---) (one between each field). Never use extra hyphens, dashes, or slashes inside any translation. If a German word contains a hyphen (-), replace it with a space. Use simple, clean translations. For nouns: always include the definite article (der, die, das) and immediately after the noun add a comma followed by the plural extension (e.g., das Auto,s for plural "Autos"; die Frau,en; der Kindergarten,¨ for "Kindergärten" — use ¨ for umlaut where needed). For verbs, adjectives, etc., no plural extension. If a word has multiple meanings, choose one clear equivalent. If there is no example sentence given then create sentence  using the word. Example correct line: das Auto,s-গাড়ি-car-Das Auto ist rot.
              </span>
              <span>"</span>
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

          <div className="space-y-2">
            <Label htmlFor="words">Words</Label>
            <Textarea
              id="words"
              placeholder={`Enter words in format: ${getExampleFormat()}\nExample:\ndas Haus-বাড়ি-house-Das Haus ist groß`}
              className="font-mono"
              rows={6}
              {...form.register("words", {
                onChange: (e) => parseWords(e.target.value),
              })}
            />
            <p className="text-sm text-muted-foreground">
              Enter each word on a new line. Use hyphens (-) to separate parts. No spaces allowed.
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