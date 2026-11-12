import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const get = (key) => {
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).replace(/^"|"$/g, '') : '';
};
const sql = neon(get('DATABASE_URL'));
const USER_ID = 'f322bbf4-d495-4aad-b238-d676de62a92c';

// severity: error = clearly wrong; minor = valid but imprecise/incomplete; mainword = headword issue; ambiguous = needs a decision
const curated = [
  // Clear errors
  { id: '66b7db6b-da3f-4f56-b35c-d20c40d49cd3', severity: 'error', reason: 't2 "কী" means "what", not "how"', t1: 'how', t2: 'কীভাবে / কেমন' },
  { id: 'c851551b-a04b-49d7-962c-78b15b25e89b', severity: 'error', reason: 't2 "বছর" means "year", not "old"', t1: 'old', t2: 'পুরনো / বয়স্ক' },
  { id: 'f09d3258-dd65-4953-b899-571acae3ebe6', severity: 'error', reason: 't1 "threes" is not the meaning in "zu dritt"', t1: 'in a group of three / three together', t2: 'তিনজনে / তিনজন মিলে' },
  { id: '57954559-38cf-4e0b-b015-ffb9dd55573d', severity: 'error', reason: '"geben" = to give; current t1/t2 mean "to be"', t1: 'to give', t2: 'দেওয়া' },
  { id: 'dacc6037-eb50-43aa-a43c-c7a4e86867d8', severity: 'error', reason: '"gern" is an adverb, not "glad"', t1: 'gladly / like to', t2: 'আনন্দের সাথে / পছন্দ করে' },
  { id: '56919897-ca3d-4b15-b730-61177eec420c', severity: 'error', reason: 't1 "mit" is not a translation of "passen"', t1: 'to fit / to match', t2: 'মেলে / মানায়' },
  { id: '8311f3ab-c9dd-43b3-9005-5bf8ee9590d6', severity: 'error', reason: 't1 typo "markt" -> "market"', t1: 'market', t2: 'বাজার' },
  { id: 'bcc11016-e952-4627-a141-a723da9c849e', severity: 'error', reason: 'noun "die Kosten" glossed as verb "to cost"', t1: 'costs', t2: 'খরচ' },
  { id: '058d2da7-33f3-40d0-9cce-d10f1885583b', severity: 'error', reason: 't1 "anymore" vs t2 "আরো" (more) mismatch', t1: 'more / anymore', t2: 'আরো / আর না' },
  { id: '070dcb0e-9fee-49c8-9037-048b0f7b449d', severity: 'error', reason: '"uns" = us, not "ours"', t1: 'us', t2: 'আমাদের' },
  { id: '0ac578c3-d32b-4153-ae1f-27594b438ebe', severity: 'error', reason: '"haben" glossed as "to make" / "নেওয়া"', t1: 'to have', t2: 'থাকা / আছে' },
  { id: 'eb1e49aa-2d0b-44db-8332-a1036e691a33', severity: 'error', reason: '"machen" glossed as "to matter" / "ব্যাপার হওয়া"', t1: 'to do / to make', t2: 'করা' },
  { id: '60998886-9c08-4d2d-ac68-e969a62968d2', severity: 'error', reason: '"Ereignis" = event, not result', t1: 'event', t2: 'ঘটনা' },
  { id: '911a1501-1606-4147-ac57-38f059f2b2a6', severity: 'error', reason: '"Kino" = cinema, not concert', t1: 'open-air cinema', t2: 'ওপেন এয়ার সিনেমা' },
  { id: '864e726b-5921-42b5-a191-3010d0846b40', severity: 'error', reason: 't1 is a note "(paying separately)", not a gloss for "gehen"', t1: 'to go', t2: 'যাওয়া' },
  { id: 'af7cdfe1-e544-49e7-943b-e1bb05c8b275', severity: 'error', reason: 't2 "পাওয়া" = to get, not "to have"', t1: 'to have', t2: 'থাকা / আছে' },
  { id: '6dcac104-4119-4861-ba57-fae23eb9ee31', severity: 'error', reason: '"nur noch" = only ... left; current t1/t2 are incomplete', t1: 'only ... left / just', t2: 'মাত্র / আর মাত্র' },
  { id: 'b6f6bc0a-0f30-4b87-af2c-9df5f92a747b', severity: 'error', reason: 'Devanagari "ता" inside Bengali t2', t1: 'clothes shopping', t2: 'পোশাক কেনাকাটা' },
  { id: 'c2bac438-da98-4d0c-8855-a626356cf4af', severity: 'error', reason: '"Kasse" = checkout/cash desk, not cashier', t1: 'checkout / cash desk', t2: 'ক্যাশ কাউন্টার / চেকআউট' },
  { id: 'c604e507-a761-4d19-aae2-a1a1ccf486e8', severity: 'error', reason: 'noun "das Skifahren" glossed as verb "to ski"', t1: 'skiing', t2: 'স্কিইং' },
  { id: 'e96a661a-9f52-4ef9-8f5f-c45d63dcc91f', severity: 'error', reason: 't2 "তারের" = "of wire"; simple noun is "তার"', t1: 'cable', t2: 'তার' },
  { id: '9a0778ba-47cf-4267-860b-ca29674c019e', severity: 'error', reason: 'stray "(অর্থহীন)" in t2', t1: 'free of charge', t2: 'বিনামূল্যে / ফ্রি' },
  { id: 'dd83e2f2-b797-48c7-8ce5-869654559311', severity: 'error', reason: 't2 "আগামীকাল" = tomorrow, not day after tomorrow', t1: 'day after tomorrow', t2: 'পরশু' },
  { id: 'cd47528a-6f55-4179-a306-031ceadaa7ac', severity: 'error', reason: '"legen" = to lay (transitive), not "to lie"', t1: 'to lay (down)', t2: 'শুইয়ে দেওয়া / রাখা' },
  { id: '80ee3315-18d4-4337-97dc-c0b2915617cf', severity: 'error', reason: '"packen" = to pack, not "to unpack"', t1: 'to pack', t2: 'প্যাক করা' },
  { id: 'a65ed02c-4f1a-4273-bd5c-0ecda62c183b', severity: 'mainword', reason: 'mainWord typo "Kunsteperte" -> "Kunstexperte"', t1: 'art expert (m)', t2: 'শিল্প বিশেষজ্ঞ (পুরুষ)', mainWord: 'der Kunstexperte,n' },
  { id: '2a08abf8-beae-47cb-8113-d70380229975', severity: 'error', reason: '"eventuell" = possibly, not "potential"', t1: 'possibly / perhaps', t2: 'সম্ভবত' },
  { id: '38166374-538f-4759-9e1d-a4a5bd62cfbc', severity: 'error', reason: 'Devanagari "ी" inside Bengali t2', t1: 'husband', t2: 'স্বামী' },
  { id: '4671e0e5-2bf2-45de-beb0-acece56a2d1c', severity: 'error', reason: 'Devanagari "न" inside Bengali t2', t1: 'fashion', t2: 'ফ্যাশন' },
  { id: '039ee867-8ed2-4283-963e-6270d3074e01', severity: 'error', reason: 'noun "die Lust" glossed as verb phrase', t1: 'desire / inclination (Lust haben = to feel like)', t2: 'ইচ্ছা / আনন্দ' },
  { id: 'c962ad14-4d3d-4e56-8a8d-fadc49f293bb', severity: 'error', reason: 'noun "das Kofferpacken" glossed as verb phrase; article should be das', t1: "packing one's suitcase", t2: 'স্যুটকেস প্যাক করা', mainWord: 'das Kofferpacken' },
  { id: 'dec20b28-1761-4b11-931f-e71612a63c9c', severity: 'error', reason: '"können" = can/to be able to, not "to know"', t1: 'can / to be able to', t2: 'পারা' },
  { id: '25bf92a4-2670-4bdb-ac5d-6aa74ef95e51', severity: 'error', reason: 't2 "ইন" is an English transliteration, not a Bengali gloss', t1: 'in / on', t2: 'এ / -এ / ভাষায়' },
  { id: '7e627ae9-4ac7-44a3-a828-5df7be9f0cc4', severity: 'error', reason: 't1 "rule" is misleading for "Normalfall" (normal case)', t1: 'normal case', t2: 'স্বাভাবিক ঘটনা' },
  { id: 'bc88c177-8fb9-4e86-90a2-23dce2352f9f', severity: 'error', reason: '"gegen" = against; current t1/t2 mean "for"', t1: 'against', t2: 'বিরুদ্ধে' },
  { id: '2d085fb1-2878-4231-ab03-8a6390f33dd0', severity: 'error', reason: '"führen" = to lead/conduct; t1 "to have" is phrase-specific', t1: 'to lead / to conduct', t2: 'পরিচালনা করা' },
  { id: '3aadc186-1f0b-4cfc-818d-028083a60ccd', severity: 'error', reason: '"Bäcker" = baker (person), not bakery', t1: 'baker', t2: 'বেকার / রুটি প্রস্তুতকারক' },
  { id: '6507892c-4cb4-46d8-a961-810826f08a30', severity: 'minor', reason: '"erkältet" is an adjective; current gloss is a verb phrase', t1: 'having a cold / with a cold', t2: 'ঠান্ডা লেগেছে / সর্দি-কাশিতে আক্রান্ত' },
  { id: '1795fa2f-288f-4f76-8aff-865250441878', severity: 'error', reason: '"husten" is a verb; current t1/t2 are nouns', t1: 'to cough', t2: 'কাশি দেওয়া' },
  { id: 'f5bc44aa-959f-4b80-8c9f-56147dc6c9c6', severity: 'error', reason: 't2 has a dangling "/ করা"', t1: 'to switch (to mute)', t2: 'সুইচ করা / মিউট করা' },
  { id: 'c6fe04db-b470-492b-b6a9-29682535a1d1', severity: 'mainword', reason: 'mainWord article/plural: "das Kursfest,e"', t1: 'course party', t2: 'কোর্সের অনুষ্ঠান', mainWord: 'das Kursfest,e' },
  { id: '7b60fa7d-99a8-4889-9b54-7438c50b3332', severity: 'mainword', reason: 'mainWord contains a space: "Wohnsituation"', t1: 'living situation', t2: 'আবাসন পরিস্থিতি', mainWord: 'die Wohnsituation,en' },
  { id: '9413bea9-ed77-47bb-a88d-40fdf68ef1b6', severity: 'mainword', reason: 'adjective should be lowercase: "arbeitslos"', t1: 'unemployed', t2: 'বেকার', mainWord: 'arbeitslos' },
  { id: 'dd58af7d-cb2f-4f75-a32f-fd1cd558302e', severity: 'mainword', reason: 'mainWord contains a space: "Skiurlaub"', t1: 'skiing holiday', t2: 'স্কি ছুটি', mainWord: 'der Skiurlaub,e' },
  { id: '14cc90d3-0c2f-40ed-b6d8-ff57a39e0f67', severity: 'mainword', reason: 'malformed plural notation in mainWord', t1: 'floor', t2: 'মেঝে', mainWord: 'der Boden,¨' },
  { id: 'ffc26bbb-72f7-4cff-b720-d357eb30c65f', severity: 'mainword', reason: 'wrong note "kein Singular"; correct plural is Stände', t1: 'status', t2: 'অবস্থা', mainWord: 'der Stand,¨e' },

  // Minor / imprecise / context
  { id: 'c3315d59-c7b0-4256-b102-f8f53980e80b', severity: 'minor', reason: 't2 covers only Mrs., while t1 lists Miss/Mrs/Ms', t1: 'Miss, Mrs, Ms', t2: 'মিসেস / মিস' },
  { id: 'a394295c-caf9-4b69-816f-780fee90f3f8', severity: 'minor', reason: '"wenig" = little/few; "a bit" is less precise', t1: 'little / few', t2: 'কম' },
  { id: '10806907-cce2-4603-9fc2-a0658a3cfe14', severity: 'minor', reason: 't2 "বাড়ি মুখে" is unnatural', t1: '(toward) home', t2: 'বাড়ির দিকে / বাড়ি' },
  { id: '58f9e713-27f8-474f-ae1c-edc263c78835', severity: 'minor', reason: 't2 "গাছপালা" is plural; headword is singular', t1: 'plant', t2: 'গাছ' },
  { id: 'c72805c6-cddb-4e86-be4f-a7c603ed2106', severity: 'minor', reason: 't2 "হাঁটা" is verbal; noun gloss is better', t1: 'walk', t2: 'পায়চারি / ভ্রমণ' },
  { id: '4fcef24e-9e90-4d9a-b2fe-e7ec018a3435', severity: 'minor', reason: 't2 includes "এলিয়েন" (alien), not a good gloss for "fremd"', t1: 'strange / foreign / alien', t2: 'অপরিচিত / বিদেশি' },
  { id: 'f23a03f6-638d-4de7-b193-8703aa5b5c44', severity: 'minor', reason: 't2 "পার্থক্যমূলক" = differential; "different" is "ভিন্ন/আলাদা"', t1: 'different', t2: 'ভিন্ন / আলাদা' },
  { id: '95f0b00f-197a-44a9-a133-53115d5fcfe7', severity: 'minor', reason: 't2 "সচিবালয়" = government secretariat; office is "অফিস"', t1: "secretary's office", t2: 'অফিস / প্রশাসনিক বিভাগ' },
  { id: 'a6ee8401-55d1-4e6b-81dd-48740d2caa7e', severity: 'minor', reason: 't2 "ঘণ্টার পর ঘণ্টা" = hour after hour, not hourly', t1: 'hourly', t2: 'ঘণ্টাপ্রতি / ঘণ্টা হিসেবে' },
  { id: 'da673bf0-0739-460e-9ae2-2ed7192a1914', severity: 'minor', reason: 't2 names the field "veterinary" instead of the person', t1: 'vet (m)', t2: 'পশুচিকিৎসক (পুরুষ)' },
  { id: 'd3bd93d5-ebeb-4019-acd9-00f76b81aff2', severity: 'minor', reason: 't2 "দরকষাকষি" = bargaining; "bargain" = good deal', t1: 'bargain', t2: 'সাশ্রয়ী মূল্যের জিনিস / সস্তা জিনিস' },
  { id: 'd1cffa5a-0bbe-47ee-9e80-c314c4c59e0e', severity: 'minor', reason: '"gelaunt" is an adjective; t1/t2 are noun/verb phrases', t1: 'in a ... mood', t2: 'মেজাজে থাকা' },
  { id: '97f08673-da1e-4c9d-b58d-fac875f7ab72', severity: 'minor', reason: 't2 "অভিযোগ অনুযায়ী" = according to complaints; "কথিত" is better', t1: 'allegedly', t2: 'কথিত / supposedly' },
  { id: '4887573f-f380-4965-ac48-290670727943', severity: 'minor', reason: 't1 "choice" and t2 "নির্বাচন" do not fully match (election)', t1: 'choice / election', t2: 'পছন্দ / নির্বাচন' },
  { id: 'b42415aa-0d34-42a4-860c-68323ec6928d', severity: 'minor', reason: 't1 "any" and t2 "আরও" (more) are context-specific/incomplete', t1: 'still / any more', t2: 'এখনও / আরও' },
  { id: '97208c44-5269-43e9-9167-0bad990c82be', severity: 'minor', reason: 't1 "to ask" is phrase-specific; "stellen" itself = to place/put', t1: 'to place / to put (eine Frage stellen = to ask a question)', t2: 'রাখা / স্থাপন করা' },
  { id: 'ba9d5cd3-4c89-4eb2-af77-0d86ad8dbe9c', severity: 'minor', reason: '"befürworten" = to support/advocate, not just agree', t1: 'to support / to advocate', t2: 'সমর্থন করা' },
  { id: '4a6c22c3-aadf-475a-bb4d-8c5a1a0937cb', severity: 'minor', reason: 'interjection "Mann!" is context-specific; "boy" alone is misleading', t1: 'man! / boy! (interjection)', t2: 'বাব্বা! / আরে!' },
  { id: '82ad5e0e-a3fc-4752-bb7d-935e12f33c8f', severity: 'minor', reason: 't2 "বরাদ্দ করা" = allocate; "zuordnen" = assign/match', t1: 'to assign / to match', t2: 'মিলানো / নির্ধারণ করা' },
  { id: '05a8dfb9-0fad-4bb8-bc25-420c7ed1859c', severity: 'minor', reason: 'mainWord is a noun but t1 is the interjection "man"; example uses the interjection', t1: 'madness / wow! (interjection)', t2: 'পাগলামি / কী দারুণ' },

  // Ambiguous / needs decision
  { id: 'd995d33e-e095-414f-baba-2895c8e68b47', severity: 'ambiguous', reason: 'mainWord "sein" but example "Was ist passiert?" uses "passieren"; decide whether to fix gloss or headword', t1: 'to be', t2: 'হওয়া' },
  { id: 'e37974a1-4efe-4d3c-85f3-5a3ea2688f06', severity: 'ambiguous', reason: '"Das macht 12 Euro" = that comes to 12 euros; t2 "হওয়া" is wrong', t1: 'to come to / to make', t2: 'হয় / দাঁড়ায়' },
  { id: 'bb3a7fac-6337-477f-92ad-4ecbcf30d688', severity: 'ambiguous', reason: '"Reis" can be raw rice (চাল) or cooked rice (ভাত); example says cooked', t1: 'rice', t2: 'চাল / ভাত' },
  { id: '5cab0775-75d9-4284-8749-ac32eb514003', severity: 'mainword', reason: 'mainWord contains the English gloss "square metre"', t1: 'square metre', t2: 'বর্গ মিটার', mainWord: 'qm / der Quadratmeter (qm)' },
];

const rows = await sql.query(
  `select id, section, main_word, translation_1, translation_2, example_sentence, notes
   from words where created_by = $1`,
  [USER_ID]
);
const byId = new Map(rows.map((r) => [r.id, r]));

const missing = curated.filter((c) => !byId.has(c.id));
if (missing.length) {
  console.error('Missing IDs:', missing.map((m) => m.id));
  process.exit(1);
}

const output = curated.map((c) => {
  const r = byId.get(c.id);
  return {
    id: c.id,
    severity: c.severity,
    section: r.section,
    mainWord: r.main_word,
    currentT1: r.translation_1,
    currentT2: r.translation_2,
    currentExample: r.example_sentence,
    proposedT1: c.t1 ?? r.translation_1,
    proposedT2: c.t2 ?? r.translation_2,
    proposedMainWord: c.mainWord ?? r.main_word,
    reason: c.reason,
  };
});

const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const csv = [
  ['id', 'severity', 'section', 'mainWord', 'current_t1', 'current_t2', 'current_example', 'proposed_t1', 'proposed_t2', 'proposed_mainWord', 'reason'].join(','),
  ...output.map((o) => [o.id, o.severity, o.section, o.mainWord, o.currentT1, o.currentT2, o.currentExample, o.proposedT1, o.proposedT2, o.proposedMainWord, o.reason].map(esc).join(',')),
];
const csvPath = 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-bad-glosses-review.csv';
fs.writeFileSync(csvPath, '\uFEFF' + csv.join('\r\n'), 'utf8');

const mdEsc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const groups = [
  ['error', 'Clear errors'],
  ['mainword', 'Headword / mainWord issues'],
  ['minor', 'Minor / imprecise'],
  ['ambiguous', 'Needs a decision'],
];
let md = '# Nowshin — bad gloss review\n\n';
md += `Account: nowshinzahidnishi@gmail.com (${rows.length} words)\\n\\n`;
md += `Total flagged: ${output.length}\\n\\n`;
for (const [sev, title] of groups) {
  const items = output.filter((o) => o.severity === sev);
  md += `## ${title} (${items.length})\\n\\n`;
  md += '| Section | mainWord | Current t1 | Current t2 | Proposed t1 | Proposed t2 | Note |\\n';
  md += '|---|---|---|---|---|---|---|\\n';
  for (const o of items) {
    const mw = o.proposedMainWord !== o.mainWord ? `${o.mainWord} → ${o.proposedMainWord}` : o.mainWord;
    md += `| ${mdEsc(o.section)} | ${mdEsc(mw)} | ${mdEsc(o.currentT1)} | ${mdEsc(o.currentT2)} | ${mdEsc(o.proposedT1)} | ${mdEsc(o.proposedT2)} | ${mdEsc(o.reason)} |\\n`;
  }
  md += '\\n';
}
md += '## Separately: plural notation\\n\\n';
md += '254 rows use `(kein Singular)` or `(kein Plural)`. 152 rows say `(kein Singular)`; many look like mass nouns that should probably say `(kein Plural)`. This is a separate data-quality cleanup and is not included in the 70 gloss fixes above.\\n';
const mdPath = 'C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-bad-glosses-review.md';
fs.writeFileSync(mdPath, md, 'utf8');

const counts = output.reduce((acc, o) => ((acc[o.severity] = (acc[o.severity] || 0) + 1), acc), {});
console.log(`Wrote ${output.length} rows: ${JSON.stringify(counts)}`);
console.log(csvPath);
for (const o of output) {
  console.log(`${o.severity}\t${o.section}\t${o.mainWord}\t${o.currentT1} | ${o.currentT2}\t=> ${o.proposedT1} | ${o.proposedT2}`);
}
