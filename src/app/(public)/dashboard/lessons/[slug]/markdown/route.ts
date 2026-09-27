import { getLessonSource, listLessons } from "@/lib/lessons";
import { lessonUrl } from "@/lib/public-lessons";

export const dynamic = "force-static";

export async function generateStaticParams() {
  return (await listLessons()).map(({ slug }) => ({ slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const markdown = await getLessonSource(slug);
  if (markdown === null) return new Response("Lesson not found", { status: 404 });
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Link": `<${lessonUrl(slug)}>; rel="canonical"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
