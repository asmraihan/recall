import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { listLessons, getLesson, getLessonSource } from "../src/lib/lessons";
import { isPublicLessonPath, lessonUrl } from "../src/lib/public-lessons";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";
import { GET as llms } from "../src/app/llms.txt/route";
import { GET as fullText } from "../src/app/llms-full.txt/route";

test("only exact lessons subtree is public", () => {
  for (const path of ["/dashboard/lessons", "/dashboard/lessons/a1-lesson", "/dashboard/lessons/new-notebook/markdown"]) assert.ok(isPublicLessonPath(path));
  for (const path of ["/dashboard", "/dashboard/words", "/dashboard/settings", "/dashboard/lessons-private"]) assert.equal(isPublicLessonPath(path), false);
});

test("every notebook is discoverable and exported in full, without authentication", async () => {
  const lessons = await listLessons();
  assert.ok(lessons.length >= 3);
  const urls = (await sitemap()).map(({ url }) => url);
  const index = await (await llms()).text();
  const all = await (await fullText()).text();
  for (const lesson of lessons) {
    const original = await readFile(`src/assets/lessons/${lesson.filename}`, "utf8");
    assert.equal(await getLessonSource(lesson.slug), original);
    assert.ok(all.includes(original));
    assert.ok(index.includes(`${lessonUrl(lesson.slug)}/markdown`));
    assert.ok(urls.includes(lessonUrl(lesson.slug)));
    assert.ok((await getLesson(lesson.slug))!.html.length > original.length);
  }
  assert.equal(await getLessonSource("../../.env"), null);
  assert.equal(await getLessonSource("not-a-lesson"), null);
  assert.equal(robots().sitemap, "https://recall-io.vercel.app/sitemap.xml");
});
