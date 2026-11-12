import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const get = (key) => {
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).replace(/^"|"$/g, '') : '';
};
const sql = neon(get('DATABASE_URL'));
const USER_ID = 'f322bbf4-d495-4aad-b238-d676de62a92c';
const ids = [
  '2d085fb1-2878-4231-ab03-8a6390f33dd0',
  '6507892c-4cb4-46d8-a961-810826f08a30',
  '3aadc186-1f0b-4cfc-818d-028083a60ccd',
  '1795fa2f-288f-4f76-8aff-865250441878',
  'f5bc44aa-959f-4b80-8c9f-56147dc6c9c6',
  '05a8dfb9-0fad-4bb8-bc25-420c7ed1859c',
  '9413bea9-ed77-47bb-a88d-40fdf68ef1b6',
  'c6fe04db-b470-492b-b6a9-29682535a1d1',
  '7b60fa7d-99a8-4889-9b54-7438c50b3332',
];
const rows = await sql.query(
  `select id, section, main_word, translation_1, translation_2, example_sentence, notes
   from words where created_by = $1 and id = any($2::uuid[]) order by section, main_word`,
  [USER_ID, ids]
);
const lines = rows.map((r) => `${r.id}\t${r.section}\t${r.main_word}\t${r.translation_1}\t${r.translation_2}\t${r.example_sentence ?? ''}\t${r.notes ?? ''}`);
const out = 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-form-extra-rows.txt';
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`wrote ${rows.length} rows to ${out}`);
