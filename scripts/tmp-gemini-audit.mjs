import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const get = (key) => {
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).replace(/^"|"$/g, '') : '';
};
const apiKey = get('GEMINI_API_KEY');
const model = process.argv.find((arg) => arg.startsWith('--model='))?.slice('--model='.length) || 'gemini-3.5-flash-lite';
const databaseUrl = get('DATABASE_URL');
const sql = neon(databaseUrl);

const USER_ID = 'f322bbf4-d495-4aad-b238-d676de62a92c';
const RESUME = process.argv.includes('--resume');
const SHUFFLE = process.argv.includes('--shuffle');
const FORM_MODE = process.argv.includes('--form');
const LIMIT_ARG = process.argv.find((arg) => /^\d+$/.test(arg));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG) : null;
const BATCH_ARG = process.argv.find((arg) => arg.startsWith('--batch='));
const BATCH_SIZE = BATCH_ARG ? Number(BATCH_ARG.slice('--batch='.length)) : 60;

const rows = await sql.query(
  `select id, section, main_word, translation_1, translation_2, example_sentence, notes
   from words where created_by = $1 order by section, main_word`,
  [USER_ID]
);
let selected = LIMIT ? rows.slice(0, LIMIT) : rows;
if (SHUFFLE) {
  let seed = 987654321;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  selected = [...selected];
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }
}

const basePrompt = `You are a meticulous German–English–Bangla vocabulary auditor.
Each item is a vocabulary card with:
- mainWord: German headword, sometimes with article and plural notation.
- translation1: expected English gloss.
- translation2: expected Bangla (Bengali) gloss.
- example: German example sentence (may be null).
- notes: optional note (may be null).

Plural notation: a double quote inside the plural part marks umlaut. Examples:
- das Glas,"er means Glas, plural Gläser.
- der Apfel," means Apfel, plural Äpfel.
- die Kunst,"e means Kunst, plural Künste.
Do NOT flag this notation as malformed.

Audit rules:
1. translation1 must be a correct English gloss for mainWord.
2. translation2 must be a correct Bangla translation of mainWord and must match translation1.
3. Ignore synonyms, optional alternatives separated by "/" or ",", parenthetical grammar notes, article differences, and minor style differences.
4. Do NOT flag a translation merely because it is broader, narrower, less specific, or could be more precise. A valid but general translation is not an error. For example, "নাম" for "der Vorname" is broad but not an error; do not flag it. If translation2 is a valid translation of at least one sense of mainWord and matches at least one alternative in translation1, do not flag it as incomplete.
5. Flag only clear, actionable ERRORS that would teach the wrong meaning:
   - translation1 is wrong for mainWord
   - translation2 is wrong for mainWord, or clearly translates a different word than translation1
   - translation1 is German or not English
   - translation2 is English or not Bengali
   - translation1 and translation2 are swapped
   - an example sentence was pasted into a translation field
   - empty, missing, or placeholder value
   - mainWord is clearly corrupted (but not plural notation)
   - example sentence is clearly not German or is unrelated to mainWord (only if example is non-null)
6. If uncertain, or if the only issue is style/precision, do not flag.
7. For each error, give concise corrected values. If a field is already correct, repeat it unchanged.

Return strict JSON only:
{"issues":[{"id":"...","confidence":"high"|"medium","problem":"short explanation","suggested1":"...","suggested2":"...","suggestedExample":"..."}]}
Include only rows with real errors. Omit suggestedExample unless the example is also wrong.`;

const formPrompt = `You are proofreading German–English–Bangla vocabulary cards for clear errors only.
Each item has mainWord (German headword with optional article/plural notation), translation1 (English gloss), translation2 (Bangla gloss), example, notes.

Plural notation: a double quote in the plural part marks umlaut (das Glas,"er -> Gläser). Do not flag it.

Focus ONLY on these categories:
1. Grammatical form mismatch: noun headword but a verb gloss, verb headword but a noun gloss, singular headword but a plural gloss (or vice versa), adjective/adverb mismatch.
2. Obvious typos or wrong characters in mainWord, translation1, or translation2 (including Devanagari characters inside Bengali).
3. translation2 is clearly the wrong meaning and does not match mainWord or translation1.
4. translation1 is German/not English, translation2 is English/not Bengali, or an example sentence is pasted into a translation.
5. Empty, missing, or placeholder values.
6. MainWord has an obvious typo.

Do NOT flag: synonyms, valid but broad/narrow translations, missing alternative senses, style/precision differences, parenthetical notes, or regional variants.
If uncertain, do not flag.

Return strict JSON only:
{"issues":[{"id":"...","confidence":"high"|"medium","problem":"short explanation","suggested1":"...","suggested2":"...","suggestedMainWord":"..."}]}
Include only rows with clear errors. Omit suggestedMainWord unless the headword itself is wrong.`;

const systemPrompt = FORM_MODE ? formPrompt : basePrompt;

function buildPrompt(items) {
  return `${systemPrompt}\n\nItems:\n${JSON.stringify(items, null, 2)}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(items) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(items) }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          issues: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                id: { type: 'STRING' },
                confidence: { type: 'STRING' },
                problem: { type: 'STRING' },
                suggested1: { type: 'STRING' },
                suggested2: { type: 'STRING' },
                suggestedExample: { type: 'STRING' },
                suggestedMainWord: { type: 'STRING' },
              },
              required: ['id', 'confidence', 'problem', 'suggested1', 'suggested2'],
            },
          },
        },
        required: ['issues'],
      },
    },
  };

  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.status === 429 || res.status === 503 || res.status >= 500) {
        const text = await res.text();
        lastError = new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
        const retryAfter = Number(res.headers.get('retry-after')) * 1000;
        const wait = Math.max(10000, Math.min(60000, 3000 * 2 ** attempt), retryAfter || 0) + Math.floor(Math.random() * 1000);
        console.error(`  retry ${attempt + 1} after ${wait}ms (HTTP ${res.status})`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
      }

      const json = await res.json();
      const finishReason = json.candidates?.[0]?.finishReason;
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (!text) throw new Error(`Empty model response (finishReason=${finishReason})`);
      if (finishReason && finishReason !== 'STOP') throw new Error(`finishReason=${finishReason}`);
      const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (error) {
        console.error(`  unparseable response: ${text.slice(0, 1200)}`);
        throw error;
      }
      if (!Array.isArray(parsed.issues)) {
        console.error(`  response without issues array: ${text.slice(0, 1200)}`);
        throw new Error('Response has no issues array');
      }
      return parsed.issues;
    } catch (error) {
      lastError = error;
      console.error(`  attempt ${attempt + 1} failed: ${error.message}`);
      await sleep(Math.min(30000, 2000 * 2 ** attempt));
    }
  }
  throw lastError || new Error('Gemini call failed');
}

const batches = [];
for (let i = 0; i < selected.length; i += BATCH_SIZE) {
  batches.push(selected.slice(i, i + BATCH_SIZE));
}

const OUT_ARG = process.argv.find((arg) => arg.startsWith('--out='));
const outPath = OUT_ARG
  ? OUT_ARG.slice('--out='.length)
  : 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-gloss-ai-audit.json';
let allIssues = [];
let checkpoint;
let startBatch = 0;

if (RESUME && !LIMIT && fs.existsSync(outPath)) {
  checkpoint = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  if (checkpoint.model !== model || checkpoint.userId !== USER_ID || checkpoint.totalRows !== rows.length) {
    throw new Error('Existing checkpoint does not match this audit run; refusing to resume.');
  }
  allIssues = Array.isArray(checkpoint.issues) ? checkpoint.issues : [];
  startBatch = Math.floor((checkpoint.auditedRows || 0) / BATCH_SIZE);
  checkpoint.auditedRows = startBatch * BATCH_SIZE;
  checkpoint.batchesCompleted = startBatch;
  checkpoint.batchesTotal = batches.length;
  checkpoint.issues = allIssues;
  checkpoint.resumedAt = new Date().toISOString();
  console.log(`Resuming at batch ${startBatch + 1}/${batches.length} (${checkpoint.auditedRows} rows already audited).`);
} else {
  checkpoint = {
    model,
    userId: USER_ID,
    totalRows: rows.length,
    auditedRows: 0,
    batchesCompleted: 0,
    batchesTotal: batches.length,
    issues: allIssues,
    startedAt: new Date().toISOString(),
  };
}

fs.writeFileSync(outPath, JSON.stringify(checkpoint, null, 2), 'utf8');

console.log(`Auditing ${selected.length} rows in ${batches.length} batches with ${model}...`);

for (let b = startBatch; b < batches.length; b++) {
  const batch = batches[b];
  const items = batch.map((row) => ({
    id: row.id,
    section: row.section,
    mainWord: row.main_word,
    translation1: row.translation_1,
    translation2: row.translation_2,
    example: row.example_sentence,
    notes: row.notes,
  }));

  console.log(`Batch ${b + 1}/${batches.length} (${items.length} rows)`);
  const issues = await callGemini(items);
  for (const issue of issues) {
    if (!issue || !issue.id) continue;
    allIssues.push({ ...issue, section: batch.find((r) => r.id === issue.id)?.section, mainWord: batch.find((r) => r.id === issue.id)?.main_word });
  }
  checkpoint.auditedRows += batch.length;
  checkpoint.batchesCompleted = b + 1;
  checkpoint.issues = allIssues;
  checkpoint.updatedAt = new Date().toISOString();
  fs.writeFileSync(outPath, JSON.stringify(checkpoint, null, 2), 'utf8');
  await sleep(1500);
}

checkpoint.finishedAt = new Date().toISOString();
fs.writeFileSync(outPath, JSON.stringify(checkpoint, null, 2), 'utf8');

const high = allIssues.filter((i) => i.confidence === 'high');
const medium = allIssues.filter((i) => i.confidence !== 'high');
console.log(`Done. issues=${allIssues.length} high=${high.length} medium=${medium.length}`);
console.log(`Wrote ${outPath}`);
