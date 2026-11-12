import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const get = (key) => {
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).replace(/^"|"$/g, '') : '';
};
const sql = neon(get('DATABASE_URL'));
const USER_ID = 'f322bbf4-d495-4aad-b238-d676de62a92c';

const targets = [
  ['1 12', 'Mann'],
  ['2 03', 'der Normalfall,¨e'],
  ['3 10', 'der Normalfall,¨e'],
  ['3 05', 'die Wahl,en'],
  ['1 02', 'noch'],
  ['1 03', 'stellen'],
  ['3 12', 'befürworten'],
  ['1 06', 'die Lust'],
  ['1 12', 'der Kofferpacken'],
  ['1 12', 'das Skifahren'],
  ['1 04', 'der Reis'],
  ['1 01', 'Frau'],
  ['1 07', 'nach Hause'],
  ['1 09', 'die Pflanze'],
  ['1 10', 'der Spaziergang,"e'],
  ['2 04', 'fremd'],
  ['2 07', 'unterschiedlich'],
  ['2 08', 'das Sekretariat,e'],
  ['2 08', 'stundenweise'],
  ['2 10', 'der Tierarzt,¨e'],
  ['2 12', 'das Schnäppchen,-'],
  ['2 12', 'gelaunt'],
  ['3 07', 'angeblich'],
  ['2 04', 'kostenlos'],
  ['1 11', 'die Mode,n'],
  ['1 10', 'der Ehemann,"er'],
];

const rows = await sql.query(
  `select id, section, main_word, translation_1, translation_2, example_sentence, notes
   from words where created_by = $1 order by section, main_word`,
  [USER_ID]
);

const lines = [];
for (const [section, mainWord] of targets) {
  const matches = rows.filter((r) => r.section === section && r.main_word === mainWord);
  if (!matches.length) {
    lines.push(`NOT FOUND: ${section} | ${mainWord}`);
    continue;
  }
  for (const r of matches) {
    lines.push(`${r.id}\t${r.section}\t${r.main_word}\t${r.translation_1}\t${r.translation_2}\t${r.example_sentence ?? ''}\t${r.notes ?? ''}`);
  }
}
const out = 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-targeted-rows.txt';
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`wrote ${lines.length} lines to ${out}`);
