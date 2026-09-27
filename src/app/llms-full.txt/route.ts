import { getLessonSource, listLessons } from "@/lib/lessons";
import { lessonUrl } from "@/lib/public-lessons";

export const dynamic = "force-static";

export async function GET() {
  const lessons = await listLessons();
  const notebooks = await Promise.all(lessons.map(async ({ slug }) =>
    `Source: ${lessonUrl(slug)}\n\n${await getLessonSource(slug)}`
  ));
  return new Response(`# Recall — complete public notebooks\n\n${notebooks.join("\n\n---\n\n")}`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
