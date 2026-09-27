import type { BatchParseIssue, UserLanguagePreferences } from "./languages";

export interface BatchWord {
  mainWord: string;
  translation2: string;
  translation1: string;
  exampleSentence: string | null;
  section: string;
}

type Delimiter = "," | ";" | "\t";
const openingQuotes = ['"', "“", "„"];

function isClosingQuote(char: string, opening: string) {
  return opening === '"' ? char === '"' : char === "”" || char === "“";
}

/** Count separators outside fields, so commas in a noun/plural or sentence stay intact. */
function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let quote = "";
  let fieldStart = true;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (isClosingQuote(char, quote)) {
        if (char === '"' && text[i + 1] === '"') i++;
        else quote = "";
      }
    } else if (fieldStart && openingQuotes.includes(char)) {
      quote = char;
      fieldStart = false;
    } else if (char in counts) {
      counts[char as Delimiter]++;
      fieldStart = true;
    } else if (char === "\n") {
      fieldStart = true;
    } else if (!/\s/.test(char)) {
      fieldStart = false;
    }
  }
  return ([",", "\t", ";"] as Delimiter[]).sort((a, b) => counts[b] - counts[a])[0];
}

function csvField(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Decide locally whether the paste contains rows or needs AI. Repair only
 * structural mistakes: never invent a translation, discard a bad row, or
 * guess how extra columns should be merged.
 */
export function analyzeBatchInput(text: string, section: string, prefs: UserLanguagePreferences) {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  // Leave blank lines where fences were, preserving error locations in the editor.
  const first = lines.findIndex((line) => line.trim());
  let last = lines.length - 1;
  while (last >= 0 && !lines[last].trim()) last--;
  if (first >= 0 && /^```(?:csv|tsv|text)?\s*$/i.test(lines[first].trim()) && lines[last].trim() === "```") {
    lines[first] = "";
    lines[last] = "";
  }
  const source = lines.join("\n");
  const nonempty = lines.filter((line) => line.trim());
  const delimiter = detectDelimiter(source);
  const structured = nonempty.some((line) =>
    line.split(delimiter).length >= 3 ||
    /["”]\s*[,;\t]|[,;\t]\s*["“„]|["”]\s+["“„]/.test(line)
  );
  const mode = nonempty.length === 0 ? "empty" : structured ? "csv" : "ai";
  const words: BatchWord[] = [];
  const issues: BatchParseIssue[] = [];
  const canonical: string[] = [];
  if (mode !== "csv") return { mode, words, issues, normalizedText: text, repaired: false };

  let i = 0;
  let line = 1;
  const advance = () => { if (source[i] === "\n") line++; i++; };
  while (i < source.length) {
    while (i < source.length && (source[i] === "\n" || source[i] === " " || (source[i] === "\t" && delimiter !== "\t"))) advance();
    if (i >= source.length) break;
    const startLine = line;
    const start = i;
    const fields: string[] = [];
    let error = "";
    let rowDone = false;
    while (!rowDone && i < source.length) {
      while (source[i] === " " || (source[i] === "\t" && delimiter !== "\t")) advance();
      let value = "";
      const opening = source[i];
      if (openingQuotes.includes(opening)) {
        advance();
        let closed = false;
        while (i < source.length) {
          if (isClosingQuote(source[i], opening)) {
            if (source[i] === '"' && source[i + 1] === '"') {
              value += '"'; i += 2;
            } else { advance(); closed = true; break; }
          } else {
            value += source[i]; advance();
          }
        }
        // A missing final quote is safe only on the final field of a single row.
        if (!closed && (value.includes("\n") || fields.length < 2 || fields.length > 3)) {
          error = "A field is missing its closing double quote.";
        }
      } else {
        while (i < source.length && source[i] !== delimiter && source[i] !== "\n") {
          if (source[i] === '"') error = "Check the quotes in this field.";
          value += source[i]; advance();
        }
      }
      fields.push(value.trim());
      while (source[i] === " " || (source[i] === "\t" && delimiter !== "\t")) advance();
      if (i >= source.length || source[i] === "\n") {
        rowDone = true;
        if (source[i] === "\n") advance();
      } else if (source[i] === delimiter) {
        advance();
        // A single trailing separator does not add a fifth column.
        if (i >= source.length || source[i] === "\n") rowDone = true;
      } else if (openingQuotes.includes(source[i])) {
        // Adjacent quoted fields separated by whitespace: missing comma.
      } else {
        error = "Unexpected text after a quoted field. Check its quotes and separators.";
        while (i < source.length && source[i] !== "\n") advance();
        rowDone = true;
      }
    }
    const label = (value: string) => value.toLowerCase().replace(/[\s_-]/g, "");
    // Recognize only the documented header order; never silently reorder translations.
    const isHeader = words.length === 0 && issues.length === 0 && canonical.length === 0 &&
      [prefs.mainLanguage, "mainWord"].some((name) => label(name) === label(fields[0] ?? "")) &&
      [prefs.translationLanguages[1] ?? "Language 2", "translation2"].some((name) => label(name) === label(fields[1] ?? "")) &&
      [prefs.translationLanguages[0] ?? "Language 1", "translation1"].some((name) => label(name) === label(fields[2] ?? "")) &&
      (fields.length === 3 || (fields.length === 4 && ["example", "examplesentence", "sentence"].includes(label(fields[3]))));
    if (!error && isHeader) { canonical.push(""); continue; }
    if (!error && (fields.length < 3 || fields.length > 4)) error = `Expected 3 or 4 fields, got ${fields.length}.`;
    if (!error && fields.slice(0, 3).some((field) => !field)) error = "The word and both translations are required.";
    if (error) {
      issues.push({ line: startLine, column: null, text: source.slice(start, i).trim(), message: error });
    } else {
      words.push({ mainWord: fields[0], translation2: fields[1], translation1: fields[2], exampleSentence: fields[3] || null, section });
      canonical.push(fields.map(csvField).join(","));
    }
  }
  const normalizedText = issues.length ? text : canonical.filter(Boolean).join("\n");
  return { mode, words: issues.length ? [] : words, issues, normalizedText, repaired: !issues.length && normalizedText !== text.trim() };
}
