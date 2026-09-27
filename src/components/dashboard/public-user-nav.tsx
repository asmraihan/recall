"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { UserNav } from "./user-nav";
import { Button } from "@/components/ui/button";

/** Only the account menu waits for auth; public lesson content never does. */
export function PublicUserNav() {
  const { data: session } = useSession();
  return session?.user ? <UserNav user={session.user} /> : (
    <Button asChild size="sm" variant="outline"><Link href="/auth/signin">Sign in</Link></Button>
  );
}
