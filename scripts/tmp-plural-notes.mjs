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
   from words where created_by = $1 and (main_word ilike '%kein Singular%' or main_word ilike '%kein Plural%')
   order by section, main_word`,
  [USER_ID]
);
const lines = rows.map((r) => `${r.id}\t${r.section}\t${r.main_word}\t${r.translation_1}\t${r.translation_2}\t${r.example_sentence ?? ''}`);
const out = 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-plural-notes.txt';
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`wrote ${rows.length} rows to ${out}`);
