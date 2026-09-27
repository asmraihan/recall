import { listLessons } from "@/lib/lessons";
import { SITE_URL, lessonUrl } from "@/lib/public-lessons";

export const dynamic = "force-static";

export async function GET() {
  const lessons = await listLessons();
  const text = [
    "# Recall lessons",
    "",
    "> Public German grammar notebooks with complete explanations, tables, example sentences and study notes.",
    "",
    "All notebooks are accessible without an account or JavaScript. HTML pages contain the full text; Markdown links contain the original notebook content.",
    "",
    "## Notebooks",
    ...lessons.map(({ slug, title }) => `- [${title}](${lessonUrl(slug)}): [Full Markdown](${lessonUrl(slug)}/markdown)`),
    "",
    "## Discovery",
    `- [Lesson index](${lessonUrl()})`,
    `- [All notebooks in one text file](${SITE_URL}/llms-full.txt)`,
    `- [Sitemap](${SITE_URL}/sitemap.xml)`,
    "",
  ].join("\n");
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
