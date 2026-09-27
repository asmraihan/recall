import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { PublicUserNav } from "@/components/dashboard/public-user-nav";

export const metadata: Metadata = {
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-snippet": -1 } },
};

/** Public server layout: complete notebook content is readable without JavaScript or a session. */
export default function PublicLessonsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex h-[52px] items-center justify-between md:justify-end px-4 md:px-6">
          <Link href="/dashboard" className="md:hidden"><GraduationCap className="h-6 w-6" /></Link>
          <PublicUserNav />
        </header>
        <main className="flex-1 space-y-4 p-4 pt-2 md:p-8 md:pt-6 mb-12">{children}</main>
        <MobileNav />
      </div>
    </div>
  );
}
