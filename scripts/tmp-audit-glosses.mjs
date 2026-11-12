import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const dbLine = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const databaseUrl = dbLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
const sql = neon(databaseUrl);
const USER_ID = 'f322bbf4-d495-4aad-b238-d676de62a92c';

const BENGALI = /[\u0980-\u09FF]/;
const LATIN = /[A-Za-z]/;

const germanWords = new Set(
  (
    'ich du er sie es wir ihr ist sind bin bist hat habe haben hatte hattest ein eine einen einem einer eines ' +
    'der die das den dem des und oder aber nicht kein keine mit für auf aus bei nach von zu im am um dass weil ' +
    'wenn ob wie was wer wo warum mein dein sein seine ihren ihre unser unsere euer eure danke bitte guten tag ' +
    'morgen abend nacht uhr zeit heute gestern immer nie oft sehr auch noch nur schon doch mal so als da hier ' +
    'dort jetzt dann wieder alle alles etwas nichts jemand niemand man'
  ).split(' ')
);

const stripParens = (s) => (s || '').replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
const tokens = (s) =>
  stripParens(s)
    .toLowerCase()
    .replace(/[.,!?;:()"“”„…/\\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const rows = await sql.query(
  `select id, main_word, translation_1, translation_2, example_sentence, notes, section
   from words where created_by = $1 order by section, main_word`,
  [USER_ID]
);

const flags = new Map();
const candidates = [];
const sectionCounts = new Map();

for (const row of rows) {
  const t1 = row.translation_1;
  const t2 = row.translation_2;
  const t1s = (t1 || '').trim();
  const t2s = (t2 || '').trim();
  const ex = row.example_sentence || '';
  const reasons = [];

  if (t1 === null || t1 === undefined || t1s === '') reasons.push('t1_null_or_empty');
  if (t2 === null || t2 === undefined || t2s === '') reasons.push('t2_null_or_empty');
  if (!BENGALI.test(t2s)) reasons.push('t2_no_bengali');
  if (BENGALI.test(t2s) && LATIN.test(t2s)) reasons.push('t2_mixed');
  if (BENGALI.test(t1s)) reasons.push('t1_has_bengali');
  if (!LATIN.test(t1s) && !BENGALI.test(t1s)) reasons.push('t1_no_letters');

  const ts = tokens(t1s);
  let deScore = 0;
  for (const token of ts) if (germanWords.has(token)) deScore++;
  if (deScore >= 2) reasons.push(`t1_german_score_${deScore}`);
  if (deScore >= 1 && ts.length >= 3 && /[.!?]$/.test(t1s)) reasons.push('t1_german_sentence');
  if (/[äöüßÄÖÜ]/.test(stripParens(t1s))) reasons.push('t1_umlaut_outside_parens');

  if (t1s && t2s && t1s.toLowerCase() === t2s.toLowerCase()) reasons.push('t1_equals_t2');
  if (/[!?]/.test(t1s)) reasons.push('t1_has_question_or_exclamation');
  if (/[!?]/.test(t2s)) reasons.push('t2_has_question_or_exclamation');
  if (ts.length >= 5) reasons.push(`t1_long_${ts.length}`);
  const t2Tokens = tokens(t2s);
  if (t2Tokens.length >= 5) reasons.push(`t2_long_${t2Tokens.length}`);
  if (ts.length >= 4 && /[.!?]$/.test(t1s)) reasons.push('t1_sentence_like');
  if (t2Tokens.length >= 4 && /[.!?]$/.test(t2s)) reasons.push('t2_sentence_like');

  if (((t1s.match(/\(/g) || []).length !== (t1s.match(/\)/g) || []).length)) reasons.push('t1_unbalanced_parens');
  if (((t2s.match(/\(/g) || []).length !== (t2s.match(/\)/g) || []).length)) reasons.push('t2_unbalanced_parens');
  if (/\s{2,}/.test(t1s)) reasons.push('t1_double_space');
  if (/\s{2,}/.test(t2s)) reasons.push('t2_double_space');
  if (t1 && t1 !== t1s) reasons.push('t1_outer_whitespace');
  if (t2 && t2 !== t2s) reasons.push('t2_outer_whitespace');
  if (/[,;:]{2,}/.test(t1s)) reasons.push('t1_repeated_punct');
  if (/[,;:]{2,}/.test(t2s)) reasons.push('t2_repeated_punct');

  const mw = row.main_word || '';
  if (mw.includes(',"')) reasons.push('mainword_quote_artifact');
  if (/\s+[A-Za-z]{2,}\s*$/.test(mw) && /^[A-Za-zäöüÄÖÜß]/.test(mw) === false) reasons.push('mainword_maybe_english_tail');
  if (/\b(square metre|the|to|of|and|with|for)\b/i.test(mw)) reasons.push('mainword_contains_english');
  if (/^\s|\s$/.test(mw)) reasons.push('mainword_outer_whitespace');
  if (/[.!?]$/.test(mw)) reasons.push('mainword_trailing_punct');

  if (row.example_sentence === null || ex.trim() === '') reasons.push('example_null_or_empty');
  if (ex && t1s && ex.trim().toLowerCase() === t1s.toLowerCase()) reasons.push('example_equals_t1');
  if (ex && t2s && ex.trim().toLowerCase() === t2s.toLowerCase()) reasons.push('example_equals_t2');

  const sk = row.section || '(none)';
  sectionCounts.set(sk, (sectionCounts.get(sk) || 0) + 1);

  if (reasons.length) {
    candidates.push({
      id: row.id,
      section: row.section,
      mainWord: row.main_word,
      t1,
      t2,
      example: row.example_sentence,
      notes: row.notes,
      reasons,
    });
    for (const r of reasons) flags.set(r, (flags.get(r) || 0) + 1);
  }
}

const result = {
  totalRows: rows.length,
  sections: Object.fromEntries([...sectionCounts.entries()].sort()),
  flagCounts: Object.fromEntries([...flags.entries()].sort((a, b) => b[1] - a[1])),
  candidateCount: candidates.length,
  candidates,
};

const out = 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-gloss-audit.json';
fs.writeFileSync(out, JSON.stringify(result, null, 2), 'utf8');
console.log(`totalRows=${rows.length} candidateRows=${candidates.length}`);
console.log('flagCounts=');
for (const [k, v] of [...flags.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${v}\t${k}`);
console.log(`\nwrote ${out}`);
