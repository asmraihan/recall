import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeBatchInput } from "../src/lib/batch-input";
import { DEFAULT_LANGUAGE_PREFERENCES as prefs } from "../src/lib/languages";

const analyze = (text: string, section = "12") => analyzeBatchInput(text, section, prefs);
const row = '"das Haus","বাড়ি","house","Das Haus ist groß."';

test("valid CSV stays CSV and retains translation order and section", () => {
  const result = analyze(row);
  assert.equal(result.mode, "csv");
  assert.equal(result.repaired, false);
  assert.deepEqual(result.words[0], { mainWord: "das Haus", translation2: "বাড়ি", translation1: "house", exampleSentence: "Das Haus ist groß.", section: "12" });
});

for (const [name, text] of [
  ["unquoted fields", "das Haus,বাড়ি,house"],
  ["smart quotes", "“das Haus”,“বাড়ি”,“house”"],
  ["German quotes", "„das Haus“,„বাড়ি“,„house“"],
  ["missing comma", '"das Haus" "বাড়ি","house"'],
  ["missing final quote", '"das Haus","বাড়ি","house'],
  ["trailing comma", '"das Haus","বাড়ি","house",'],
  ["tab separated", "das Haus\tবাড়ি\thouse"],
  ["semicolon separated", "das Haus;বাড়ি;house"],
  ["fences and header", '```csv\nGerman,Bangla,English\n"das Haus","বাড়ি","house"\n```'],
  ["BOM and CRLF", '\uFEFF"das Haus","বাড়ি","house"\r\n'],
]) test(`repairs ${name} locally`, () => {
  const result = analyze(text);
  assert.equal(result.mode, "csv");
  assert.deepEqual(result.issues, []);
  assert.equal(result.words.length, 1);
  assert.equal(result.words[0].mainWord, "das Haus");
  assert.equal(result.words[0].translation1, "house");
  assert.deepEqual(analyze(result.normalizedText).words, result.words);
});

test("quoted commas, escaped quotes and multiline sentences survive", () => {
  const result = analyze('"das Haus,Häuser","বাড়ি","house","Er sagt ""Hallo"",\nund geht."');
  assert.deepEqual(result.issues, []);
  assert.equal(result.words[0].mainWord, "das Haus,Häuser");
  assert.equal(result.words[0].exampleSentence, 'Er sagt "Hallo",\nund geht.');
  assert.deepEqual(analyze(result.normalizedText).words, result.words);
});

for (const text of ["das Haus\ngünstig\nguten Tag", "das Haus, Häuser", "Please translate the following words into English.", ""]) {
  test(`raw input chooses ${text ? "AI" : "empty"}: ${text}`, () => {
    const result = analyze(text);
    assert.equal(result.mode, text ? "ai" : "empty");
    assert.deepEqual(result.words, []);
  });
}

for (const bad of ['"Haus","house"', '"Haus","","house"', "a,b,c,d,e", "\tবাড়ি\thouse", '"Haus","বাড়ি","house\n"Baum","গাছ","tree"']) {
  test(`ambiguous CSV is blocked without discarding rows: ${bad}`, () => {
    const result = analyze(row + "\n\n" + bad);
    assert.equal(result.mode, "csv");
    assert.ok(result.issues.length);
    assert.equal(result.issues[0].line, 3);
    assert.deepEqual(result.words, []);
  });
}

test("section and source edits cannot reuse stale preview values", () => {
  assert.equal(analyze(row, "13").words[0].section, "13");
  assert.equal(analyze(row.replace("house", "home")).words[0].translation1, "home");
});
