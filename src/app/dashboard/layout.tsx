"use client";

import { redirect, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { UserNav } from "@/components/dashboard/user-nav";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Routes under /dashboard that are accessible without signing in
// (keep in sync with PUBLIC_PATHS in src/middleware.ts)
const PUBLIC_PATHS = ["/dashboard/lessons"];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (status === "loading" && !isPublicPage) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (status === "unauthenticated" && !isPublicPage) {
    redirect("/auth/signin");
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex h-[52px] items-center justify-between md:justify-end px-4 md:px-6">
          <Link href="/dashboard" className=" md:hidden">
            <GraduationCap className="h-6 w-6" />
          </Link>
          {session?.user ? (
            <UserNav user={session.user} />
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href="/auth/signin">Sign in</Link>
            </Button>
          )}
        </header>
        <main className="flex-1 space-y-4 p-4 pt-2 md:p-8 md:pt-6 mb-12">
          {children}
        </main>
        <MobileNav />
      </div>
    </div>
  );
}