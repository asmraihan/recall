import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const get = (key) => {
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).replace(/^"|"$/g, '') : '';
};
const sql = neon(get('DATABASE_URL'));
const USER_ID = 'f322bbf4-d495-4aad-b238-d676de62a92c';
const rows = await sql.query(
  `select id, section, main_word, translation_1, translation_2, example_sentence
   from words where created_by = $1 order by section, main_word`,
  [USER_ID]
);

const nounArticle = /^(der|die|das)\s+/i;
const findings = [];
for (const row of rows) {
  const mw = row.main_word || '';
  const t1 = (row.translation_1 || '').trim();
  const t2 = (row.translation_2 || '').trim();
  const reasons = [];
  if (nounArticle.test(mw) && /^to\s+/i.test(t1)) reasons.push('noun_headword_but_verb_gloss');
  if (!nounArticle.test(mw) && /^(a|an|the)\s+/i.test(t1) && !/^to\s+/i.test(t1)) reasons.push('non_noun_headword_but_noun_gloss');
  if (/\b(kein Singular|kein Plural|Plural)\b/i.test(mw) && /^to\s+/i.test(t1)) reasons.push('noun_marker_but_verb_gloss');
  if (reasons.length) findings.push({ ...row, reasons });
}

const out = 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-noun-verb-mismatch.json';
fs.writeFileSync(out, JSON.stringify(findings, null, 2), 'utf8');
console.log(`findings=${findings.length} -> ${out}`);
