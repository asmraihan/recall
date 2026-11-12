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
  `select id, section, main_word, translation_1, translation_2, example_sentence, notes
   from words where created_by = $1 order by section, main_word`,
  [USER_ID]
);

const BENGALI = /[\u0980-\u09FF]/;
const LATIN = /[A-Za-z]/;
const DEVANAGARI = /[\u0900-\u097F]/;
const ARABIC = /[\u0600-\u06FF]/;
const CYRILLIC = /[\u0400-\u04FF]/;
const CJK = /[\u4E00-\u9FFF]/;
const GREEK = /[\u0370-\u03FF]/;

const findings = [];
const add = (row, reason, detail = '') => findings.push({ id: row.id, section: row.section, mainWord: row.main_word, t1: row.translation_1, t2: row.translation_2, example: row.example_sentence, reason, detail });

const byMain = new Map();
const byT1 = new Map();
const byT2 = new Map();

for (const row of rows) {
  const t1 = row.translation_1 || '';
  const t2 = row.translation_2 || '';
  const mw = row.main_word || '';

  if (!BENGALI.test(t2)) add(row, 't2_no_bengali');
  if (BENGALI.test(t2) && LATIN.test(t2)) add(row, 't2_has_latin');
  if (BENGALI.test(t1)) add(row, 't1_has_bengali');
  if (!LATIN.test(t1)) add(row, 't1_no_latin');
  if (DEVANAGARI.test(t1) || DEVANAGARI.test(t2) || DEVANAGARI.test(mw)) add(row, 'devanagari_char');
  if (ARABIC.test(t1) || ARABIC.test(t2) || ARABIC.test(mw)) add(row, 'arabic_char');
  if (CYRILLIC.test(t1) || CYRILLIC.test(t2) || CYRILLIC.test(mw)) add(row, 'cyrillic_char');
  if (CJK.test(t1) || CJK.test(t2) || CJK.test(mw)) add(row, 'cjk_char');
  if (GREEK.test(t1) || GREEK.test(t2) || GREEK.test(mw)) add(row, 'greek_char');
  if (/[äöüßÄÖÜ]/.test(t1.replace(/\([^)]*\)/g, ''))) add(row, 't1_umlaut_outside_parens');
  if (/\b(undefined|null|n\/a|todo|tbd|xxx|\?\?+)\b/i.test(t1) || /\b(undefined|null|n\/a|todo|tbd|xxx|\?\?+)\b/i.test(t2)) add(row, 'placeholder');
  if (/\(\s*[A-Za-z][^)]*\)/.test(t2)) add(row, 't2_parenthetical_latin');
  if (t1.trim() && t2.trim() && t1.trim().toLowerCase() === t2.trim().toLowerCase()) add(row, 't1_equals_t2');
  if (!t1.trim() || !t2.trim()) add(row, 'empty_translation');

  const mainKey = `${row.section}||${mw.trim().toLowerCase()}`;
  if (!byMain.has(mainKey)) byMain.set(mainKey, []);
  byMain.get(mainKey).push(row);

  const t1Key = t1.trim().toLowerCase();
  if (t1Key) {
    if (!byT1.has(t1Key)) byT1.set(t1Key, []);
    byT1.get(t1Key).push(row);
  }
  const t2Key = t2.trim().toLowerCase();
  if (t2Key) {
    if (!byT2.has(t2Key)) byT2.set(t2Key, []);
    byT2.get(t2Key).push(row);
  }
}

for (const [key, group] of byMain) {
  if (group.length > 1) {
    for (const row of group) add(row, 'duplicate_mainword_section', `group size ${group.length}`);
  }
}

for (const [key, group] of byT1) {
  if (group.length >= 3) {
    for (const row of group) add(row, 'repeated_t1', `${group.length} rows share t1 "${key}"`);
  }
}
for (const [key, group] of byT2) {
  if (group.length >= 3) {
    for (const row of group) add(row, 'repeated_t2', `${group.length} rows share t2 "${key}"`);
  }
}

const out = 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-deterministic-findings.json';
fs.writeFileSync(out, JSON.stringify({ totalRows: rows.length, findings }, null, 2), 'utf8');

const counts = new Map();
for (const f of findings) counts.set(f.reason, (counts.get(f.reason) || 0) + 1);
console.log(`totalRows=${rows.length} findings=${findings.length}`);
for (const [reason, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(`${count}\t${reason}`);
console.log(`\nwrote ${out}`);
