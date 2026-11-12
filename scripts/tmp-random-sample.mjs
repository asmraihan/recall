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

// Deterministic shuffle so the sample is reproducible.
let seed = 123456789;
const rand = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 4294967296);
};
const shuffled = [...rows];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
const sample = shuffled.slice(0, 80);

const lines = [];
for (const row of sample) {
  lines.push(`${row.section}\t${row.main_word}\t${row.translation_1}\t${row.translation_2}\t${row.example_sentence ?? ''}`);
}
const out = 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-random-sample.txt';
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`wrote ${sample.length} rows to ${out}`);
