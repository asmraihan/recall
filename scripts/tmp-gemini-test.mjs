import fs from 'node:fs';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const get = (key) => {
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).replace(/^"|"$/g, '') : '';
};
const apiKey = get('GEMINI_API_KEY');
const model = 'gemini-3.5-flash-lite';


const items = [
  { id: 'good-1', mainWord: 'das Haus,"er', translation1: 'house', translation2: 'বাড়ি', example: 'Das Haus ist groß.' },
  { id: 'bad-1', mainWord: 'der Hund,e', translation1: 'cat', translation2: 'বিড়াল', example: 'Der Hund bellt.' },
  { id: 'bad-2', mainWord: 'die Kunst,"e', translation1: 'art', translation2: 'art', example: 'Die Kunst ist schön.' },
  { id: 'good-2', mainWord: 'um', translation1: 'at (time)', translation2: 'টায় / সময়ে', example: 'Abends um sieben essen wir alle zusammen.' },
  { id: 'bad-3', mainWord: 'der Apfel,"', translation1: 'apple', translation2: 'আপেল', example: null },
];

const prompt = `You are auditing a German vocabulary deck. For each item:
- mainWord is the German headword, possibly with article and plural notation. A quote mark inside the plural notation means umlaut (e.g., das Glas,"er -> Gläser).
- translation1 should be an English gloss.
- translation2 should be a Bangla (Bengali) gloss matching the German word and translation1.
- example is a German example sentence (may be null).

Flag only CLEAR errors: wrong meaning, wrong language, untranslated German, English left in translation2, Bengali in translation1, missing/empty, or translation2 not matching translation1. Do not flag legitimate alternatives, parenthetical notes, or minor wording.
Return strict JSON only: {"issues":[{"id":"...","problem":"short explanation","suggested1":"...","suggested2":"..."}]}
Include only items with issues. If none, return {"issues":[]}.

Items:
${JSON.stringify(items, null, 2)}`;

const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 90000);
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          issues: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                id: { type: 'STRING' },
                confidence: { type: 'STRING' },
                problem: { type: 'STRING' },
                suggested1: { type: 'STRING' },
                suggested2: { type: 'STRING' },
                suggestedExample: { type: 'STRING' },
              },
              required: ['id', 'confidence', 'problem', 'suggested1', 'suggested2'],
            },
          },
        },
        required: ['issues'],
      },
    },
  }),
  signal: controller.signal,
}).finally(() => clearTimeout(timer));
console.log('status', res.status);
const text = await res.text();
console.log(text.slice(0, 4000));
