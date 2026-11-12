import fs from 'node:fs';

const NL = String.fromCharCode(10);
const csvPath = 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-bad-glosses-review.csv';
const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // skip
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const [header, ...rows] = parseCsv(raw);
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const items = rows.map((r) => ({
  id: r[idx.id],
  severity: r[idx.severity],
  section: r[idx.section],
  mainWord: r[idx.mainWord],
  currentT1: r[idx.current_t1],
  currentT2: r[idx.current_t2],
  currentExample: r[idx.current_example],
  proposedT1: r[idx.proposed_t1],
  proposedT2: r[idx.proposed_t2],
  proposedMainWord: r[idx.proposed_mainWord],
  reason: r[idx.reason],
}));

const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const groups = [
  ['error', 'Clear errors'],
  ['mainword', 'Headword / mainWord issues'],
  ['minor', 'Minor / imprecise'],
  ['ambiguous', 'Needs a decision'],
];

const lines = [];
lines.push('# Nowshin — bad gloss review');
lines.push('');
lines.push('Account: nowshinzahidnishi@gmail.com (5,792 words)');
lines.push('');
lines.push(`Total flagged: ${items.length}`);
lines.push('');
for (const [sev, title] of groups) {
  const group = items.filter((o) => o.severity === sev);
  lines.push(`## ${title} (${group.length})`);
  lines.push('');
  lines.push('| Section | mainWord | Current t1 | Current t2 | Proposed t1 | Proposed t2 | Note |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const o of group) {
    const mw = o.proposedMainWord !== o.mainWord ? `${o.mainWord} → ${o.proposedMainWord}` : o.mainWord;
    lines.push(`| ${esc(o.section)} | ${esc(mw)} | ${esc(o.currentT1)} | ${esc(o.currentT2)} | ${esc(o.proposedT1)} | ${esc(o.proposedT2)} | ${esc(o.reason)} |`);
  }
  lines.push('');
}
lines.push('## Separately: plural notation');
lines.push('');
lines.push('254 rows use `(kein Singular)` or `(kein Plural)`. 152 rows say `(kein Singular)`; many look like mass nouns that should probably say `(kein Plural)`. This is a separate data-quality cleanup and is not included in the gloss fixes above.');
lines.push('');

const mdPath = 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-bad-glosses-review.md';
fs.writeFileSync(mdPath, lines.join(NL), 'utf8');
console.log('wrote', mdPath, 'items', items.length);
