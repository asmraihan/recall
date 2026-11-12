import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const get = (k) => { const l = env.split(/\r?\n/).find((x) => x.startsWith(`${k}=`)); return l ? l.slice(k.length + 1).replace(/^"|"$/g, '') : ''; };
const sql = neon(get('DATABASE_URL'));
const ids = ['7907594a-004e-47bb-be72-9476b78bd2d8','bdadb41a-2434-46c7-9c74-3281a3e053f6','dd58af7d-cb2f-4f75-a32f-fd1cd558302e','14cc90d3-0c2f-40ed-b6d8-ff57a39e0f67','ffc26bbb-72f7-4cff-b720-d357eb30c65f','05a8dfb9-0fad-4bb8-bc25-420c7ed1859c'];
const rows = await sql.query(`select id, section, main_word, translation_1, translation_2, example_sentence from words where created_by=$1 and id = any($2::uuid[])`, ['f322bbf4-d495-4aad-b238-d676de62a92c', ids]);
fs.writeFileSync('C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-form-extra2.txt', rows.map(r => [r.id,r.section,r.main_word,r.translation_1,r.translation_2,r.example_sentence].join('\t')).join('\n'), 'utf8');
console.log('rows', rows.length);
