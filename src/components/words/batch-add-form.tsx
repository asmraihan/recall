"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ClipboardPaste,
  Copy,
  CornerDownRight,
  Hash,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { parseBatchWords, buildGlossarFormatPrompt } from "@/lib/languages";
import type { BatchParseIssue, UserLanguagePreferences } from "@/lib/languages";

// Define the form schema
const formSchema = z.object({
  pattern: z.literal("default"), // Only one pattern for now
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

/**
 * Turns a parser message into a plain-language fix, but only for cases we can
 * identify with confidence. Returns null rather than guessing.
 */
function hintForIssue(issue: BatchParseIssue): string | null {
  const charAtColumn = issue.column ? issue.text[issue.column - 1] : undefined;

  if (issue.message.includes("expected ','")) {
    // The parser stopped where a comma should be. A quote there means two
    // fields were written back to back with the comma missing.
    return charAtColumn === '"'
      ? "Missing comma between two fields."
      : "Fields must be separated by a comma.";
  }
  if (issue.message.includes("unterminated")) {
    return "A field is missing its closing double quote.";
  }
  if (issue.message.includes(`expected '"'`)) {
    return "Every field must be wrapped in double quotes.";
  }
  if (issue.message.includes("expected 3 or 4 fields")) {
    return "Each line needs 3 fields, or 4 with an example sentence.";
  }
  return null;
}

export function BatchAddForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [issues, setIssues] = useState<BatchParseIssue[]>([]);
  const [parsedWords, setParsedWords] = useState<ParsedWord[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [isFormatting, setIsFormatting] = useState(false);
  const [section, setSection] = useState("");
  const [languagePrefs, setLanguagePrefs] = useState<UserLanguagePreferences | null>(null);
  const [tab, setTab] = useState<"ai" | "manual">("ai");
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

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
          translationLanguages: ["English", "Bangla"],
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

  /**
   * Parses the CSV text and syncs preview/error state.
   * Returns the parsed rows so callers don't have to read the (still stale)
   * state value in the same render pass.
   */
  const parseWords = (text: string, sectionValue?: string): ParsedWord[] => {
    if (!languagePrefs) return [];

    const result = parseBatchWords(
      text,
      pattern,
      sectionValue ?? form.getValues("section"),
      languagePrefs
    );

    setIssues(result.issues);

    if (result.issues.length > 0) {
      setParsedWords([]);
      return [];
    }

    setParsedWords(result.words as ParsedWord[]);
    return result.words as ParsedWord[];
  };

  /**
   * Focuses the CSV textarea and selects the given 1-based line, so the browser
   * scrolls it into view and the offending text is visibly highlighted.
   */
  const jumpToLine = (lineNumber: number) => {
    setTab("manual");
    // Wait a tick: if we were on the AI tab the textarea isn't mounted yet.
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const lines = textarea.value.split("\n");
      const index = Math.min(Math.max(lineNumber - 1, 0), lines.length - 1);
      const start = lines.slice(0, index).reduce((sum, l) => sum + l.length + 1, 0);
      const end = start + lines[index].length;

      textarea.focus();
      textarea.setSelectionRange(start, end);

      // Selecting doesn't always scroll far enough on its own — nudge the
      // scroll so the line sits a couple of rows below the top edge.
      const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
      const target = (index - 2) * lineHeight;
      if (target < textarea.scrollTop || target > textarea.scrollTop + textarea.clientHeight) {
        textarea.scrollTop = Math.max(0, target);
      }
    });
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

      // Drop the result into the manual textarea so the user can review/edit,
      // and move them to that tab so the result isn't hidden behind a tab.
      form.setValue("words", formatted, { shouldValidate: true });
      parseWords(formatted);
      setTab("manual");
      toast.success("Formatted with AI. Review the result before adding.");
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

    // Re-parse on submit so we never post a stale preview.
    const wordsToUse = parsedWords.length > 0 ? parsedWords : parseWords(data.words);
    if (wordsToUse.length === 0) {
      toast.error("No valid words to add. Check the format and try again.");
      return;
    }

    try {
      setIsAdding(true);
      // Prepare words with all fields including example sentence
      const wordsToSubmit = wordsToUse.map((word) => ({
        mainWord: word.mainWord,
        translation2: word.translation2,
        translation1: word.translation1,
        exampleSentence: word.exampleSentence,
        section: word.section,
      }));

      const response = await fetch("/api/words/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: wordsToSubmit }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to add words");
      }

      toast.success(
        result.message || `Added ${wordsToUse.length} words to section ${result.section}`
      );
      form.reset({
        pattern: "default",
        words: "",
        section: "",
      });
      setSection("");
      setAiInput("");
      setParsedWords([]);
      setIssues([]);
      setTab("ai");

      // Refresh the word list
      await queryClient.invalidateQueries({ queryKey: ["words"] });
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add words. Please try again."
      );
    } finally {
      setIsAdding(false);
    }
  };

  const handleCopyPrompt = async () => {
    if (!languagePrefs) return;
    try {
      await navigator.clipboard.writeText(buildGlossarFormatPrompt(languagePrefs));
      setHasCopied(true);
      toast.success("Prompt copied to clipboard!");
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the text and copy manually.");
    }
  };

  // Sync section state with form
  const handleSectionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSection(value);
    form.setValue("section", value, { shouldValidate: true });
    // Re-parse so the preview picks up the new section immediately
    parseWords(form.getValues("words"), value);
  };

  if (!languagePrefs) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading language preferences...
      </div>
    );
  }

  const mainLang = languagePrefs.mainLanguage;
  const lang1 = languagePrefs.translationLanguages[0] || "Language 1";
  const lang2 = languagePrefs.translationLanguages[1] || "Language 2";

  const getExampleFormat = () => `"${mainLang}","${lang2}","${lang1}","Example sentence"`;

  // Split react-hook-form's ref off so we can keep our own handle on the
  // textarea for jumpToLine() while RHF still tracks the field.
  const { ref: registerWordsRef, ...wordsField } = form.register("words", {
    onChange: (e) => parseWords(e.target.value),
  });

  const aiLineCount = aiInput.trim() ? aiInput.trim().split("\n").filter(Boolean).length : 0;
  const totalLines = form
    .watch("words")
    .split("\n")
    .filter((line) => line.trim().length > 0).length;
  const canSubmit = parsedWords.length > 0 && !!section && !isAdding;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/* Step 1 — Section                                                  */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              1
            </span>
            <CardTitle className="text-base">Choose a section</CardTitle>
          </div>
          <CardDescription>
            Every word in this batch is filed under this section (your chapter number).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-[220px]">
            <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Label htmlFor="section" className="sr-only">
              Section number
            </Label>
            <Input
              id="section"
              type="text"
              value={section}
              onChange={handleSectionChange}
              placeholder="e.g. 12"
              className="pl-9"
              aria-describedby="section-hint"
            />
          </div>
          {!section && (
            <p id="section-hint" className="mt-2 text-sm text-muted-foreground">
              Required before you can add words.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Step 2 — Input (AI or manual CSV)                                 */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              2
            </span>
            <CardTitle className="text-base">Add your words</CardTitle>
          </div>
          <CardDescription>
            Let AI clean up a messy paste, or paste ready-made CSV yourself.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "ai" | "manual")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ai" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Format with AI
              </TabsTrigger>
              <TabsTrigger value="manual" className="gap-2">
                <ClipboardPaste className="h-4 w-4" />
                Paste CSV
                {parsedWords.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {parsedWords.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ------------------------- AI tab ------------------------- */}
            <TabsContent value="ai" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Paste raw words straight from your Glossar — one per line, any format, no
                quotes or commas needed. AI translates and formats them, then hands the
                result to the <span className="font-medium">Paste CSV</span> tab so you can
                review before adding.
              </p>

              <Textarea
                id="ai-input"
                placeholder={`das Haus\ngünstig\nguten Tag`}
                className="min-h-[180px] font-mono"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                disabled={isFormatting}
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={handleAIFormat}
                  disabled={isFormatting || !aiInput.trim()}
                >
                  {isFormatting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  {isFormatting ? "Formatting..." : "Format with AI"}
                </Button>
                {aiLineCount > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {aiLineCount} {aiLineCount === 1 ? "line" : "lines"} ready
                  </span>
                )}
              </div>
            </TabsContent>

            {/* ----------------------- Manual tab ----------------------- */}
            <TabsContent value="manual" className="mt-4 space-y-3">
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-sm font-medium">Expected format — one word per line</p>
                <code className="mt-1.5 block break-all font-mono text-xs text-muted-foreground">
                  {getExampleFormat()}
                </code>
                <code className="mt-1 block break-all font-mono text-xs text-muted-foreground">
                  &quot;das Haus&quot;,&quot;বাড়ি&quot;,&quot;house&quot;,&quot;Das Haus ist
                  groß.&quot;
                </code>
                <p className="mt-2 text-xs text-muted-foreground">
                  Wrap each field in double quotes, separate with commas. The example
                  sentence is optional.
                </p>
              </div>

              {/* Expandable prompt for use with an external AI */}
              <div className="rounded-md border">
                <button
                  type="button"
                  onClick={() => setIsPromptOpen((open) => !open)}
                  aria-expanded={isPromptOpen}
                  aria-controls="glossar-prompt"
                  className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Prompt for ChatGPT or another AI
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      isPromptOpen && "rotate-180"
                    )}
                  />
                </button>

                {isPromptOpen && (
                  <div id="glossar-prompt" className="space-y-2 border-t px-3 py-3">
                    <p className="text-xs text-muted-foreground">
                      Prefer your own AI tool? Copy this prompt, run it there, and paste the
                      CSV it returns into the box below. It&apos;s the same prompt the
                      Format with AI tab uses.
                    </p>
                    <div className="relative">
                      <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 pr-12 font-mono text-xs whitespace-pre-wrap">
                        {buildGlossarFormatPrompt(languagePrefs)}
                      </pre>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleCopyPrompt}
                        aria-label="Copy prompt to clipboard"
                        className="absolute right-2 top-2 h-8 w-8"
                      >
                        {hasCopied ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="words">CSV words</Label>
                  {totalLines > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {totalLines} {totalLines === 1 ? "line" : "lines"}
                      {issues.length > 0 && (
                        <span className="text-destructive">
                          {" "}
                          · {issues.length} with errors
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <Textarea
                  id="words"
                  placeholder={`"das Haus","বাড়ি","house","Das Haus ist groß."`}
                  className="min-h-[180px] font-mono"
                  {...wordsField}
                  ref={(element) => {
                    registerWordsRef(element);
                    textareaRef.current = element;
                  }}
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Parse errors                                                      */}
      {/* ---------------------------------------------------------------- */}
      {issues.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="space-y-3">
            <p className="font-medium">
              {issues.length} {issues.length === 1 ? "line needs" : "lines need"} fixing
              {totalLines > 0 && (
                <span className="font-normal opacity-80">
                  {" "}
                  · {totalLines - issues.length} of {totalLines} look fine
                </span>
              )}
            </p>

            <ul className="max-h-72 space-y-2 overflow-auto">
              {issues.map((issue) => {
                const hint = hintForIssue(issue);
                return (
                  <li key={`${issue.line}-${issue.column ?? 0}`}>
                    <button
                      type="button"
                      onClick={() => jumpToLine(issue.line)}
                      title="Jump to this line in the CSV box"
                      className="w-full rounded-md border border-current/20 bg-background/40 p-2 text-left transition-colors hover:bg-background/70"
                    >
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge variant="outline" className="border-current/40 font-mono">
                          Line {issue.line}
                        </Badge>
                        <span className="text-xs">{issue.message}</span>
                        <span className="ml-auto flex items-center gap-1 text-xs underline underline-offset-2 opacity-80">
                          <CornerDownRight className="h-3 w-3" />
                          Go to line
                        </span>
                      </span>
                      <code className="mt-1.5 block break-all font-mono text-xs opacity-80">
                        {issue.text}
                      </code>
                      {hint && <span className="mt-1 block text-xs font-medium">{hint}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="text-xs opacity-80">
              Expected format:{" "}
              <code className="font-mono">{getExampleFormat()}</code>
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Step 3 — Preview + submit                                         */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              3
            </span>
            <CardTitle className="text-base">Review and add</CardTitle>
            {parsedWords.length > 0 && (
              <Badge variant="secondary">{parsedWords.length} words</Badge>
            )}
          </div>
          <CardDescription>
            {parsedWords.length > 0
              ? "Check the parsed rows below, then add them to your collection."
              : "Your parsed words will appear here."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {parsedWords.length > 0 ? (
            <div className="rounded-md border">
              <div className="max-h-[360px] overflow-y-auto">
                {/* table-fixed + whitespace-normal: the shared TableCell/TableHead
                    default to whitespace-nowrap, which made long example
                    sentences stretch the table horizontally instead of wrapping. */}
                <Table className="table-fixed [&_td]:whitespace-normal [&_td]:break-words [&_td]:align-top [&_th]:whitespace-normal">
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="w-[20%]">{mainLang}</TableHead>
                      <TableHead className="w-[17%]">{lang2}</TableHead>
                      <TableHead className="w-[17%]">{lang1}</TableHead>
                      <TableHead className="w-[34%]">Example</TableHead>
                      <TableHead className="w-[12%]">Section</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedWords.map((word, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{word.mainWord}</TableCell>
                        <TableCell>{word.translation2}</TableCell>
                        <TableCell>{word.translation1}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {word.exampleSentence || "—"}
                        </TableCell>
                        <TableCell>{word.section || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              Nothing to preview yet — add words in step 2.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canSubmit}>
              {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isAdding
                ? "Adding..."
                : parsedWords.length > 0
                  ? `Add ${parsedWords.length} ${parsedWords.length === 1 ? "word" : "words"}`
                  : "Add words"}
            </Button>
            {!canSubmit && !isAdding && (
              <span className="text-sm text-muted-foreground">
                {!section
                  ? "Enter a section number in step 1."
                  : "Add some words in step 2."}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
