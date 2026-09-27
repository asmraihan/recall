import assert from "node:assert/strict";
import { listLessons, getLessonSource } from "../src/lib/lessons";

async function main() {
  const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3100";
  const lessons = await listLessons();
  for (const userAgent of ["Mozilla/5.0", "GPTBot", "ClaudeBot"]) {
    const index = await fetch(`${base}/dashboard/lessons`, { redirect: "manual", headers: { "User-Agent": userAgent } });
    assert.equal(index.status, 200);
    const html = await index.text();
    for (const { slug } of lessons) {
      assert.ok(html.includes(`/dashboard/lessons/${slug}`));
      const page = await fetch(`${base}/dashboard/lessons/${slug}`, { redirect: "manual", headers: { "User-Agent": userAgent } });
      assert.equal(page.status, 200);
      const body = await page.text();
      const article = body.match(/<article\b[^>]*>([\s\S]*?)<\/article>/)?.[1];
      assert.ok(article && article.length > 10000, "Full notebook must be in HTML, not just script data");
      assert.ok(body.includes('name="robots" content="index, follow"'));
      assert.ok(body.includes('rel="canonical"'));
      assert.ok(body.includes("md:block w-[240px]"), "Original desktop sidebar must remain");
      const markdown = await fetch(`${base}/dashboard/lessons/${slug}/markdown`);
      assert.equal(markdown.status, 200);
      assert.ok(markdown.headers.get("content-type")?.includes("text/markdown"));
      assert.equal(await markdown.text(), await getLessonSource(slug));
    }
  }
  for (const path of ["/robots.txt", "/sitemap.xml", "/llms.txt", "/llms-full.txt"]) {
    assert.equal((await fetch(base + path, { redirect: "manual" })).status, 200);
  }
  assert.equal((await fetch(`${base}/dashboard/lessons/not-a-notebook`, { redirect: "manual" })).status, 404);
  assert.equal((await fetch(`${base}/dashboard/lessons/not-a-notebook/markdown`, { redirect: "manual" })).status, 404);
  for (const path of ["/dashboard/settings", "/dashboard/words/add/batch", "/dashboard/lessons-private"]) {
    const response = await fetch(base + path, { redirect: "manual" });
    assert.ok([302, 307].includes(response.status));
    assert.ok(response.headers.get("location")?.includes("/auth/signin"));
  }
  // Authentication rejection only: this never deletes real data.
  const unauthorized = await fetch(`${base}/api/words/delete-sections`, {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sections: [] }),
  });
  assert.equal(unauthorized.status, 401);
  console.log(`Public HTTP checks passed for ${lessons.length} notebooks and 3 user agents; private routes remain protected.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
