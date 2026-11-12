import fs from 'node:fs';

const path = 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-gloss-ai-audit-form.json';
if (!fs.existsSync(path)) {
  console.log('no file');
  process.exit(0);
}
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
console.log('audited', data.auditedRows, 'issues', data.issues.length);
const lines = data.issues.map(
  (i) => `${i.id}\t${i.section}\t${i.mainWord}\t${i.problem}\t=> ${i.suggested1} | ${i.suggested2}${i.suggestedMainWord ? ` | main: ${i.suggestedMainWord}` : ''}`
);
fs.writeFileSync('C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-form-partial.txt', lines.join('\n'), 'utf8');
console.log('wrote partial');
