import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const get = (k) => { const l = env.split(/\r?\n/).find((x) => x.startsWith(`${k}=`)); return l ? l.slice(k.length + 1).replace(/^"|"$/g, '') : ''; };
const sql = neon(get('DATABASE_URL'));
const rows = await sql.query(`select id, section, main_word, translation_1, translation_2, example_sentence from words where created_by=$1 and id=$2`, ['f322bbf4-d495-4aad-b238-d676de62a92c', 'bc88c177-8fb9-4e86-90a2-23dce2352f9f']);
fs.writeFileSync('C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-gegen.txt', rows.map(r => [r.id,r.section,r.main_word,r.translation_1,r.translation_2,r.example_sentence].join('\t')).join('\n'), 'utf8');
console.log('ok');
