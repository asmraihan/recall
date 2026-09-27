import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";

export const metadata: Metadata = {
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-snippet": -1 } },
};

/** Public server layout: complete notebook content is readable without JavaScript or a session. */
export default function PublicLessonsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-background">
        <nav aria-label="Lessons navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-8">
          <Link href="/dashboard/lessons" className="flex items-center gap-2 font-semibold"><BookOpen className="h-5 w-5" />Recall · Lessons</Link>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">Open Recall</Link>
        </nav>
      </header>
      <main className="p-4 md:p-8">{children}</main>
      <footer className="mx-auto flex max-w-6xl flex-wrap gap-4 border-t px-4 py-6 text-sm text-muted-foreground md:px-8">
        <Link href="/dashboard/lessons">All lessons</Link>
        <a href="/llms.txt">Notebook index for AI readers</a>
        <a href="/llms-full.txt">All notebooks as text</a>
      </footer>
    </div>
  );
}
