// Language utility functions and types
export const SUPPORTED_LANGUAGES = [
  'German',
  'English',
  'Spanish',
  'French',
  'Italian',
  'Portuguese',
  'Dutch',
  'Swedish',
  'Norwegian',
  'Danish',
  'Polish',
  'Russian',
  'Chinese',
  'Japanese',
  'Korean',
  'Hindi',
  'Bengali',
  'Bangla',
  'Arabic',
  'Turkish',
] as const;

export type Language = typeof SUPPORTED_LANGUAGES[number];

export interface UserLanguagePreferences {
  mainLanguage: Language;
  translationLanguages: Language[];
}

// Default preferences
export const DEFAULT_LANGUAGE_PREFERENCES: UserLanguagePreferences = {
  mainLanguage: 'German',
  translationLanguages: ['English', 'Bangla'],
};

/**
 * Get language labels for form fields based on user preferences
 */
export function getLanguageLabels(prefs: UserLanguagePreferences) {
  return {
    mainLanguage: prefs.mainLanguage,
    translation1: prefs.translationLanguages[0] || 'Language 1',
    translation2: prefs.translationLanguages[1] || 'Language 2',
  };
}

/**
 * Build the glossary-formatting prompt used both in the batch-add UI (shown so
 * users can run it in an external chat) and by the AI-format API endpoint.
 * Produces CSV lines that parseBatchWords() can consume directly.
 */
export function buildGlossarFormatPrompt(prefs: UserLanguagePreferences): string {
  const main = prefs.mainLanguage;
  const trans1 = prefs.translationLanguages[0] || 'Language 1';
  const trans2 = prefs.translationLanguages[1] || 'Language 2';

  return `Generate a CSV translation list of ${main} words. Output each word on its own line in this exact format:

"${main}","${trans2}","${trans1}","Example sentence"

Rules:
- Wrap every field in double quotes (").
- Separate fields with a single comma. No spaces around the comma.
- Output only the CSV lines — no headers, no numbering, no commentary.
- Always include an example sentence in ${main}. If none is given, write a natural one using the word.
- Nouns: include the article (der/die/das) and append the plural after a comma inside the same quoted field, e.g. "das Auto,s", "die Frau,en", "der Kindergarten,¨" (use ¨ for umlaut plurals like Kindergärten).
- Verbs, adjectives, and all non-nouns: no plural extension.
- If a word has multiple meanings, pick one clear translation.
- Hyphens, dashes, slashes, and spaces inside fields are fine because fields are quoted (e.g. "low-priced" and "good day" are valid).
- NEVER output a raw double quote inside a field. The only allowed double quotes are the ones that wrap each field. If some inner text truly needs a quote, double it ("").

Handling messy / pasted input:
- The input is often copied from a printed glossary and may be messy. Clean it up:
  - Fix obvious OCR/scan errors to correct ${main} spelling (e.g. "KQste" → "Küste", "Sqnd" → "Sand", "gngenehm" → "angenehm", "1m" → "Im").
  - Rejoin example sentences that were split across lines.
- The source words and their translations may appear as two separate blocks or columns rather than paired lines. Match them up in their original order, one to one.
- When a translation, article, plural, or example sentence is already given in the input, use it (after cleaning) instead of inventing a new one. Only invent what is missing.
- Interpret these source notations instead of copying them literally:
  - "(Sg.)" means singular-only — omit the plural extension entirely.
  - "hier:" or "hier." marks the intended meaning in context — use that translation.
  - A straight double quote marking an umlaut plural, e.g. 'der Gruß, "-e', means the umlauted plural (Grüße). Convert it to the ¨ convention: write "der Gruß,¨e". Do not keep the double quote.

Example output:
"das Auto,s","গাড়ি","car","Das Auto ist rot."
"günstig","সস্তা","low-priced","Die Miete ist günstig."
"guten Tag","শুভ দিন","good day","Guten Tag! Wie geht es Ihnen?"
"der Gruß,¨e","শুভেচ্ছা","greeting","Er schickt viele Grüße aus dem Urlaub."`;
}

/**
 * Get column accessor keys for database
 */
export function getColumnAccessors() {
  return {
    mainWord: 'mainWord',
    translation1: 'translation1',
    translation2: 'translation2',
  };
}

/**
 * Get CSV export headers
 */
export function getExportHeaders(prefs: UserLanguagePreferences) {
  return {
    mainWord: prefs.mainLanguage,
    translation1: prefs.translationLanguages[0] || 'Language 1',
    translation2: prefs.translationLanguages[1] || 'Language 2',
    section: 'Section',
    exampleSentence: 'Sentence',
    notes: 'Notes',
    important: 'Important',
  };
}

/**
 * Parse a single CSV-style line of quoted, comma-separated fields.
 * Each field must be wrapped in double quotes; embedded quotes are escaped as "".
 */
function parseCSVLine(line: string): { fields: string[] } | { error: string } {
  const fields: string[] = [];
  const len = line.length;
  let i = 0;

  while (i < len) {
    while (i < len && line[i] === ' ') i++;
    if (i >= len) break;
    if (line[i] !== '"') {
      return { error: `expected '"' at column ${i + 1}` };
    }
    i++;
    let value = '';
    let closed = false;
    while (i < len) {
      const ch = line[i];
      if (ch === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i += 2;
        } else {
          i++;
          closed = true;
          break;
        }
      } else {
        value += ch;
        i++;
      }
    }
    if (!closed) {
      return { error: 'unterminated quoted field' };
    }
    fields.push(value.trim());
    while (i < len && line[i] === ' ') i++;
    if (i < len) {
      if (line[i] !== ',') {
        return { error: `expected ',' at column ${i + 1}` };
      }
      i++;
    }
  }
  return { fields };
}

/**
 * Parse batch import words based on user language preferences.
 * Format per line: "<main>","<trans2>","<trans1>","<sentence?>"
 */
/** A single unparseable line, with the info needed to locate it in the source text. */
export interface BatchParseIssue {
  /** 1-based line number in the ORIGINAL text, including blank lines. */
  line: number;
  /** Short description, e.g. "expected ',' at column 39". */
  message: string;
  /** 1-based column the parser choked on, when known. */
  column: number | null;
  /** The offending line, trimmed. */
  text: string;
}

export function parseBatchWords(
  text: string,
  pattern: string,
  section: string,
  prefs: UserLanguagePreferences
) {
  // Keep the ORIGINAL line numbers: blank lines are skipped for parsing but
  // still counted, so reported line numbers match the user's textarea exactly.
  const entries = text
    .split('\n')
    .map((line, index) => ({ text: line.trim(), line: index + 1 }))
    .filter(entry => entry.text.length > 0);

  const words: any[] = [];
  const errors: string[] = [];
  const issues: BatchParseIssue[] = [];

  const expected = `"${prefs.mainLanguage}","${prefs.translationLanguages[1]}","${prefs.translationLanguages[0]}","[optional sentence]"`;

  const fail = (line: number, text: string, message: string, withExpected = true) => {
    const column = message.match(/at column (\d+)/)?.[1];
    issues.push({
      line,
      message,
      column: column ? Number(column) : null,
      text,
    });
    errors.push(
      `Line ${line}: ${message}.\n` +
      (withExpected ? `Expected: ${expected}\n` : '') +
      `Got: ${text}`
    );
  };

  entries.forEach(({ text: line, line: lineNumber }) => {
    const result = parseCSVLine(line);
    if ('error' in result) {
      fail(lineNumber, line, result.error);
      return;
    }

    const { fields } = result;
    if (fields.length < 3 || fields.length > 4) {
      fail(lineNumber, line, `expected 3 or 4 fields, got ${fields.length}`);
      return;
    }

    if (!fields[0] || !fields[1] || !fields[2]) {
      fail(
        lineNumber,
        line,
        `${prefs.mainLanguage}, ${prefs.translationLanguages[1]}, and ${prefs.translationLanguages[0]} are required`,
        false
      );
      return;
    }

    words.push({
      mainWord: fields[0],
      translation2: fields[1],
      translation1: fields[2],
      exampleSentence: fields[3] || null,
      section: section,
    });
  });

  return { words, errors, issues };
}

/**
 * Generate direction options from user language preferences
 * Returns array of {value, label} for direction selectors
 */
export function generateDirectionOptions(prefs: UserLanguagePreferences) {
  const main = prefs.mainLanguage;
  const trans1 = prefs.translationLanguages[0] || 'Language 1';
  const trans2 = prefs.translationLanguages[1] || 'Language 2';
  
  return [
    { value: 'main_to_trans1', label: `${main} → ${trans1}` },
    { value: 'trans1_to_main', label: `${trans1} → ${main}` },
    { value: 'main_to_trans2', label: `${main} → ${trans2}` },
    { value: 'trans2_to_main', label: `${trans2} → ${main}` },
  ];
}

/**
 * Map old hardcoded direction format to new generic format
 * Used for backward compatibility with existing data
 */
export function mapOldDirectionToNew(
  oldDirection: string,
  prefs: UserLanguagePreferences
): string {
  // Map old hardcoded directions to new generic format
  const directionMap: Record<string, string> = {
    'german_to_english': 'main_to_trans1',
    'english_to_german': 'trans1_to_main',
    'german_to_bangla': 'main_to_trans2',
    'bangla_to_german': 'trans2_to_main',
  };
  
  return directionMap[oldDirection] || oldDirection;
}
