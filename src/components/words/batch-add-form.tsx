"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Check, Copy, Hash, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildGlossarFormatPrompt, DEFAULT_LANGUAGE_PREFERENCES, type UserLanguagePreferences } from "@/lib/languages";
import { analyzeBatchInput } from "@/lib/batch-input";

export function BatchAddForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [section, setSection] = useState("");
  const [languagePrefs, setLanguagePrefs] = useState<UserLanguagePreferences | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadPreferences() {
      try {
        const response = await fetch("/api/user/languages");
        if (!response.ok) throw new Error("Could not load language preferences");
        const prefs = await response.json();
        if (active) setLanguagePrefs(prefs);
      } catch {
        if (active) {
          setLanguagePrefs(DEFAULT_LANGUAGE_PREFERENCES);
          toast.error("Could not load language preferences. Using German, English and Bangla.");
        }
      }
    }
    void loadPreferences();
    return () => { active = false; };
  }, []);

  // Edits and section changes update both preview and submission. Detecting
  // CSV is entirely local and never makes an AI request.
  const analysis = useMemo(
    () => analyzeBatchInput(text, section.trim(), languagePrefs ?? DEFAULT_LANGUAGE_PREFERENCES),
    [text, section, languagePrefs]
  );
  const { mode, words, issues, repaired } = analysis;
  const busy = isAdding || isFormatting;
  const overLimit = words.length > 100;
  const canSubmit = mode === "csv" && words.length > 0 && !!section.trim() && !overLimit && !busy;

  const jumpToLine = (lineNumber: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const lines = textarea.value.split("\n");
    const index = Math.min(Math.max(lineNumber - 1, 0), lines.length - 1);
    const start = lines.slice(0, index).reduce((sum, line) => sum + line.length + 1, 0);
    textarea.focus();
    textarea.setSelectionRange(start, start + lines[index].length);
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    textarea.scrollTop = Math.max(0, (index - 2) * lineHeight);
  };

  const handleAIFormat = async () => {
    if (busyRef.current || mode !== "ai" || !text.trim() || !languagePrefs) return;
    busyRef.current = true;
    setIsFormatting(true);
    setRequestError(null);
    try {
      const response = await fetch("/api/words/format", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to format words");
      if (typeof result.formatted !== "string" || !result.formatted.trim()) {
        throw new Error("AI returned no formatted words. Try again.");
      }
      const formatted = analyzeBatchInput(result.formatted, section.trim(), languagePrefs);
      if (formatted.mode !== "csv") throw new Error("AI did not return CSV. Your original text is still here; please try again.");
      setText(formatted.normalizedText);
      if (formatted.issues.length) {
        setRequestError("AI returned rows that need checking. Fix the highlighted lines before adding.");
      } else {
        toast.success("Formatted with AI. Review the translations before adding.");
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Could not format words. Please try again.");
    } finally { busyRef.current = false; setIsFormatting(false); }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || busyRef.current || !languagePrefs) return;
    // Re-parse current input rather than posting an earlier preview or section.
    const current = analyzeBatchInput(text, section.trim(), languagePrefs);
    if (current.mode !== "csv" || current.issues.length || !current.words.length) return;
    busyRef.current = true;
    setIsAdding(true);
    setRequestError(null);
    try {
      const response = await fetch("/api/words/batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: current.words }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to add words");
      toast.success(result.message || `Added ${current.words.length} words.`);
      setText(""); setSection("");
      await queryClient.invalidateQueries({ queryKey: ["words"] });
      router.refresh();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Could not add words. Please try again.");
    } finally { busyRef.current = false; setIsAdding(false); }
  };

  const copyPrompt = async () => {
    if (!languagePrefs) return;
    try {
      await navigator.clipboard.writeText(buildGlossarFormatPrompt(languagePrefs));
      setHasCopied(true); setTimeout(() => setHasCopied(false), 2000);
    } catch { toast.error("Couldn't copy. Select the prompt and copy it manually."); }
  };

  if (!languagePrefs) return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading language preferences...
    </div>
  );
  const mainLang = languagePrefs.mainLanguage;
  const lang1 = languagePrefs.translationLanguages[0] || "Language 1";
  const lang2 = languagePrefs.translationLanguages[1] || "Language 2";
  const exampleFormat = `"${mainLang}","${lang2}","${lang1}","Example sentence"`;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choose a section</CardTitle>
          <CardDescription>Every word in this batch belongs to this chapter.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-[220px]">
            <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Label htmlFor="section" className="sr-only">Section number</Label>
            <Input id="section" value={section} onChange={(event) => setSection(event.target.value)}
              disabled={busy} placeholder="e.g. 12" className="pl-9" required />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Paste your words</CardTitle>
          <CardDescription>Paste CSV, spreadsheet rows, or raw glossary text. The format is detected automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="words">Words or CSV</Label>
            <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {mode === "csv" ? "Paste CSV · detected automatically" : mode === "ai" ? "Format with AI · unformatted text detected" : "Format detected as you paste"}
            </span>
          </div>
          <Textarea id="words" ref={textareaRef} value={text} disabled={busy}
            onChange={(event) => { setText(event.target.value); setRequestError(null); }}
            placeholder={'das Haus\ngünstig\nguten Tag\n\nOr paste CSV:\n"das Haus","বাড়ি","house","Das Haus ist groß."'}
            className="min-h-[220px] font-mono" aria-describedby="input-help" aria-invalid={issues.length > 0} />
          <p id="input-help" className="text-sm text-muted-foreground">
            {mode === "ai" ? "AI will translate and format this text. You can review and edit the result before adding."
              : mode === "csv" && repaired ? "CSV detected. Small formatting mistakes have been repaired in the preview."
              : "CSV is parsed directly. Unformatted text automatically uses the AI formatting option."}
          </p>
          {mode === "ai" && <div className="space-y-2">
            <Button type="button" onClick={handleAIFormat} disabled={busy || text.trim().length > 20000}>
              {isFormatting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {isFormatting ? "Formatting..." : "Format with AI"}
            </Button>
            {text.trim().length > 20000 && <p className="text-sm text-destructive">Use up to 20,000 characters per AI request.</p>}
          </div>}
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">CSV format and prompt for another AI</summary>
            <div className="mt-3 space-y-3">
              <code className="block break-all text-xs">{exampleFormat}</code>
              <p className="text-xs text-muted-foreground">The example sentence is optional. Commas, tabs and semicolons are supported. Quote fields that contain separators.</p>
              <div className="relative">
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 pr-12 font-mono text-xs">{buildGlossarFormatPrompt(languagePrefs)}</pre>
                <Button type="button" variant="outline" size="icon" onClick={copyPrompt} aria-label="Copy prompt" className="absolute right-2 top-2 h-8 w-8">
                  {hasCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </details>
        </CardContent>
      </Card>
      {requestError && <Alert variant="destructive" role="alert"><AlertCircle className="h-4 w-4" /><AlertDescription>{requestError}</AlertDescription></Alert>}
      {issues.length > 0 && <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="space-y-3">
          <p className="font-medium">This looks like CSV. Check these rows before adding; no words will be skipped.</p>
          <ul className="max-h-72 space-y-2 overflow-auto">{issues.map((issue) => <li key={issue.line}>
            <button type="button" onClick={() => jumpToLine(issue.line)} className="w-full rounded-md border border-current/20 p-2 text-left">
              <span className="text-sm font-medium">Line {issue.line}: {issue.message}</span>
              <code className="mt-1 block break-all text-xs">{issue.text}</code>
              <span className="mt-1 block text-xs underline">Go to line</span>
            </button>
          </li>)}</ul>
          <p className="text-xs">Expected: <code>{exampleFormat}</code></p>
        </AlertDescription>
      </Alert>}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">3. Review and add</CardTitle>
            {words.length > 0 && <Badge variant="secondary">{words.length} words</Badge>}
          </div>
          <CardDescription>Check the words and translations before saving them to your collection.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {words.length > 0 ? <div className="max-h-[360px] overflow-auto rounded-md border">
            <Table className="table-fixed [&_td]:whitespace-normal [&_td]:break-words [&_td]:align-top [&_th]:whitespace-normal">
              <TableHeader className="sticky top-0 z-10 bg-background"><TableRow>
                <TableHead className="w-[20%]">{mainLang}</TableHead><TableHead className="w-[17%]">{lang2}</TableHead>
                <TableHead className="w-[17%]">{lang1}</TableHead><TableHead className="w-[34%]">Example</TableHead><TableHead className="w-[12%]">Section</TableHead>
              </TableRow></TableHeader>
              <TableBody>{words.map((word, index) => <TableRow key={index}>
                <TableCell className="font-medium">{word.mainWord}</TableCell><TableCell>{word.translation2}</TableCell><TableCell>{word.translation1}</TableCell>
                <TableCell>{word.exampleSentence || "—"}</TableCell><TableCell>{word.section || "—"}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div> : <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">{mode === "ai" ? "Format your text with AI to see the preview." : "Your parsed words will appear here."}</p>}
          {overLimit && <p className="text-sm text-destructive">Add up to 100 words at a time. Split this batch before saving.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canSubmit}>
              {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isAdding ? "Adding..." : words.length ? `Add ${words.length} ${words.length === 1 ? "word" : "words"}` : "Add words"}
            </Button>
            {!section.trim() && <span className="text-sm text-muted-foreground">Enter a section number in step 1.</span>}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
