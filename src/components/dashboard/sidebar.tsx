"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  BookText,
  Home,
  ListPlus,
  Settings,
  GraduationCap,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: GraduationCap },
  { name: "My Words", href: "/dashboard/words", icon: BookOpen },
  { name: "Add Words", href: "/dashboard/words/add", icon: ListPlus },
  { name: "Lessons", href: "/dashboard/lessons", icon: BookText },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="hidden border-r bg-background md:block w-[240px]">
      <div className="flex h-full flex-col gap-2">
        <div className="flex h-[52px] items-center border-b px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <GraduationCap className="h-6 w-6" />
            <span>Recall</span>
          </Link>
        </div>
        <div className="flex-1 overflow-auto py-2">
          <nav className="grid items-start px-2 text-sm font-medium">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Button
                  key={item.name}
                  asChild
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "justify-start gap-2",
                    isActive && "bg-secondary"
                  )}
                >
                  <Link href={item.href}>
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                </Button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
} 