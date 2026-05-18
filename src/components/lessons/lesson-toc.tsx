"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { TocEntry } from "@/lib/lessons";

interface LessonTocProps {
  sections: TocEntry[];
}

export function LessonToc({ sections }: LessonTocProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const visibleRef = useRef<Set<string>>(new Set());
  const linksRef = useRef<Map<string, HTMLAnchorElement>>(new Map());

  useEffect(() => {
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleRef.current.add(entry.target.id);
          } else {
            visibleRef.current.delete(entry.target.id);
          }
        }
        const firstVisible = sections.find((s) => visibleRef.current.has(s.id));
        if (firstVisible) {
          setActiveId(firstVisible.id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );

    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  useEffect(() => {
    if (!activeId) return;
    const link = linksRef.current.get(activeId);
    link?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  return (
    <nav className="pr-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        On this page
      </div>
      <ol className="space-y-1.5 text-sm border-l">
        {sections.map((s) => {
          const isActive = activeId === s.id;
          return (
            <li key={s.id}>
              <a
                ref={(el) => {
                  if (el) linksRef.current.set(s.id, el);
                  else linksRef.current.delete(s.id);
                }}
                href={`#${s.id}`}
                className={cn(
                  "block -ml-px pl-3 py-0.5 border-l transition-colors",
                  isActive
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-foreground/50"
                )}
              >
                {s.text}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
