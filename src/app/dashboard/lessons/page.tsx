import Link from "next/link";
import { BookText, ChevronRight } from "lucide-react";
import { listLessons } from "@/lib/lessons";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-static";

export default async function LessonsIndexPage() {
  const lessons = await listLessons();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Lessons</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Grammar references and study notes. Tap a lesson to read.
        </p>
      </div>

      {lessons.length === 0 ? (
        <div className="text-sm text-muted-foreground">No lessons available.</div>
      ) : (
        <div className="grid gap-3">
          {lessons.map((lesson) => (
            <Link key={lesson.slug} href={`/dashboard/lessons/${lesson.slug}`} className="group">
              <Card className="transition-colors group-hover:bg-accent/40">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <BookText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{lesson.title}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {lesson.filename}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
