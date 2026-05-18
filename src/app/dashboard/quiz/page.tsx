import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { words } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { listLessons, getLesson } from "@/lib/lessons";
import { QuizRunner } from "@/components/quiz/quiz-runner";

export const dynamic = "force-dynamic";

export default async function QuizPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const sectionRows = await db
    .select({ section: words.section, count: count() })
    .from(words)
    .where(eq(words.createdBy, session.user.id))
    .groupBy(words.section)
    .orderBy(words.section);

  const lessonList = await listLessons();
  const lessons = await Promise.all(
    lessonList.map(async (l) => {
      const lesson = await getLesson(l.slug);
      const sections = (lesson?.toc ?? []).filter((t) => t.depth === 2);
      const levelMatch = l.filename.match(/^([AB][12])_/i);
      const level = levelMatch ? levelMatch[1].toUpperCase() : l.slug.toUpperCase();
      return { level, title: l.title, sections };
    })
  );

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Quiz</h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI-generated practice. 10 questions per round.
        </p>
      </div>
      <QuizRunner
        sections={sectionRows.map((r) => ({
          value: r.section,
          count: Number(r.count),
        }))}
        lessons={lessons}
      />
    </div>
  );
}

