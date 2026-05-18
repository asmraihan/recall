import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, List } from "lucide-react";
import { getLesson, listLessons } from "@/lib/lessons";
import { LessonToc } from "@/components/lessons/lesson-toc";

export const dynamic = "force-static";

export async function generateStaticParams() {
  const lessons = await listLessons();
  return lessons.map((l) => ({ slug: l.slug }));
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lesson = await getLesson(slug);
  if (!lesson) notFound();

  const sections = lesson.toc.filter((t) => t.depth === 2);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link
          href="/dashboard/lessons"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All lessons
        </Link>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight mb-2">{lesson.title}</h1>
      <div className="text-xs text-muted-foreground mb-4">
        {sections.length} sections
      </div>

      {sections.length > 0 && (
        <details className="mb-6 rounded-lg border bg-muted/30 lg:hidden">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium flex items-center gap-2">
            <List className="h-4 w-4" />
            Table of contents
            <span className="ml-auto text-xs text-muted-foreground">
              {sections.length}
            </span>
          </summary>
          <ol className="px-4 pb-4 space-y-1.5 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-muted-foreground hover:text-foreground hover:underline"
                >
                  {s.text}
                </a>
              </li>
            ))}
          </ol>
        </details>
      )}

      <div className="lg:grid lg:grid-cols-[1fr_240px] lg:gap-8">
        <article
          className="prose prose-sm md:prose-base max-w-none dark:prose-invert
            prose-headings:scroll-mt-20 prose-headings:font-semibold
            prose-h1:text-2xl prose-h2:text-xl prose-h3:text-base
            prose-h2:mt-10 prose-h2:pb-1 prose-h2:border-b
            prose-table:text-sm prose-th:text-left
            [&_table]:border [&_table]:border-collapse
            [&_th]:border [&_th]:px-3 [&_th]:py-2 [&_th]:align-top [&_th]:bg-muted/40
            [&_td]:border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top
            prose-code:before:content-none prose-code:after:content-none
            prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5
            prose-pre:bg-muted prose-blockquote:border-l-primary/50
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
          dangerouslySetInnerHTML={{ __html: lesson.html }}
        />

        {sections.length > 0 && (
          <aside className="hidden lg:block lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <LessonToc sections={sections} />
          </aside>
        )}
      </div>
    </div>
  );
}
