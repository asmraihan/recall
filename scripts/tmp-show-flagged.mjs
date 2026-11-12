import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const get = (key) => {
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).replace(/^"|"$/g, '') : '';
};
const sql = neon(get('DATABASE_URL'));
const USER_ID = 'f322bbf4-d495-4aad-b238-d676de62a92c';
const auditPath = process.argv[2] || 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-gloss-ai-audit.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const ids = audit.issues.map((i) => i.id);

const rows = await sql.query(
  `select id, section, main_word, translation_1, translation_2, example_sentence, notes
   from words where created_by = $1 and id = any($2::uuid[]) order by section, main_word`,
  [USER_ID, ids]
);
const byId = new Map(rows.map((r) => [r.id, r]));

const lines = [];
for (const issue of audit.issues) {
  const row = byId.get(issue.id);
  lines.push('='.repeat(80));
  lines.push(`ID: ${issue.id}`);
  lines.push(`Section: ${row?.section} | mainWord: ${row?.main_word}`);
  lines.push(`Current t1: ${row?.translation_1}`);
  lines.push(`Current t2: ${row?.translation_2}`);
  lines.push(`Example: ${row?.example_sentence}`);
  lines.push(`AI problem: ${issue.problem}`);
  lines.push(`AI suggested1: ${issue.suggested1}`);
  lines.push(`AI suggested2: ${issue.suggested2}`);
  if (issue.suggestedExample) lines.push(`AI suggestedExample: ${issue.suggestedExample}`);
}
const out = process.argv[3] || 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-flagged-review.txt';
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`wrote ${out}`);
