"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { SingleSelect } from "@/components/ui/single-select";
import { WordList } from "@/components/words/word-list";
import { Loader2, Upload } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ExportDialog } from "@/components/words/export-import";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useDebounce } from "@/hooks/use-debounce";
import { Columns3Cog } from 'lucide-react';

interface Word {
  id: string;
  mainWord: string;
  translation1: string | null;
  translation2: string | null;
  exampleSentence: string | null;
  notes: string | null;
  section: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface WordResponse {
  id: string;
  mainWord: string;
  translation1: string | null;
  translation2: string | null;
  exampleSentence: string | null;
  notes: string | null;
  section: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function WordsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [sections, setSections] = useState<string[]>([]);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");

  const section = searchParams.get("section");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
    mainWord: true,
    translation1: true,
    translation2: true,
    section: true,
    exampleSentence: true,
    actions: true,
  });

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(name, value);
      } else {
        params.delete(name);
      }
      return params.toString();
    },
    [searchParams]
  );

  const updateFilters = useCallback((name: string, value: string) => {
    const queryString = createQueryString(name, value);
    router.push(`${pathname}?${queryString}`, { scroll: false });
  }, [pathname, router, createQueryString]);

  useEffect(() => {
    updateFilters("search", debouncedSearch);
  }, [debouncedSearch, updateFilters]);

  // Fetch sections on mount
  useEffect(() => {
    fetch("/api/words/sections")
      .then(res => res.json())
      .then((data: { sections: string[] }) => {
        setSections(data.sections);
        // Only set section if it is not present in the URL at all
        if (searchParams.get("section") == null && data.sections.length > 0) {
          updateFilters("section", data.sections[0]);
        }
        setSectionsLoaded(true);
      });
  }, [searchParams, updateFilters]);

  // Fetch words for the selected section and filter
  const filter = searchParams.get("filter") || "default";
  const { data: words = [], isLoading, error, refetch } = useQuery<Word[]>({
    queryKey: ["words", section, filter],
    queryFn: async () => {
      let url = "/api/words";
      const params = new URLSearchParams();
      if (section === "all") {
        params.set("section", "all");
      } else if (section) {
        params.set("section", section);
      }
      if (filter && filter !== "default") {
        params.set("filter", filter);
      }
      if ([...params].length > 0) {
        url += `?${params.toString()}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch words");
      }
      const data = await response.json() as WordResponse[];
      return data.map((word) => ({
        ...word,
        createdAt: new Date(word.createdAt),
        updatedAt: new Date(word.updatedAt),
      }));
    },
    enabled: sectionsLoaded,
    retry: 1,
    staleTime: 60000, // Keep data fresh for 60 seconds
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  const filteredWords = words.filter((word) => {
    if (!debouncedSearch) return true;
    const matchesSearch =
      word.mainWord.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      (word.translation1?.toLowerCase().includes(debouncedSearch.toLowerCase()) ?? false) ||
      (word.translation2?.toLowerCase().includes(debouncedSearch.toLowerCase()) ?? false);
    return matchesSearch;
  });

  if (error) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-destructive">Error</h2>
          <p className="text-muted-foreground">
            {error instanceof Error ? error.message : "Failed to load words"}
          </p>
        </div>
        <Button onClick={() => refetch()}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Words</h1>
          <p className="text-muted-foreground mt-2">
            Manage your vocabulary collection
          </p>
        </div>
        <div className="flex gap-2">
          <ExportDialog
            selectedIds={Object.keys(rowSelection).filter((id) => rowSelection[id])}
            visibleColumns={Object.keys(columnVisibility).filter((k) => columnVisibility[k] && k !== "actions")}
            section={section ?? undefined}
            totalWords={filteredWords.length}
            allowAll={false}
          />
          <Button asChild variant="outline">
            <Link href="/dashboard/words/add">
              <Upload className="mr-2 h-4 w-4" />
              Add Words
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div className="relative w-full max-w-sm">
            <Input
              placeholder="Search words..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pr-20 w-full"
            />
            {debouncedSearch && (
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none select-none bg-white dark:bg-background px-1"
                style={{ zIndex: 2 }}
              >
                {filteredWords.length} found
              </span>
            )}

            {
           !debouncedSearch && Object.values(rowSelection).some((isSelected) => isSelected)
              && (<span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none select-none bg-white dark:bg-background px-1"
                style={{ zIndex: 2 }}
              >{Object.values(rowSelection).filter(Boolean).length} selected
              </span>
              )}
          </div>
          <SingleSelect
            value={section ?? undefined}
            onValueChange={(value) => updateFilters("section", value)}
            options={[
              { value: "all", label: "All Sections" },
              ...sections.map((sectionValue) => ({
                value: sectionValue,
                label: `Section ${sectionValue}`
              }))
            ]}
            className="w-[180px]"
          />
            <SingleSelect
            value={searchParams.get("filter") || "default"}
            onValueChange={(value) => updateFilters("filter", value)}
            options={[
              { value: "default", label: "Normal" },
              { value: "important", label: "Important" }
            ]}
            className="w-[180px]"
          />
        </div>
        
        <div className="flex justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Columns3Cog className="w-4 h-4" />
                <span className="sr-only">Toggle columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {[
                { id: "mainWord", label: "Main Word" },
                { id: "translation1", label: "Translation 1" },
                { id: "translation2", label: "Translation 2" },
                { id: "section", label: "Section" },
                { id: "exampleSentence", label: "Sentence" },
                { id: "actions", label: "Actions" },
              ].map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  className="capitalize"
                  checked={!!columnVisibility[col.id]}
                  onCheckedChange={(v) => setColumnVisibility((prev) => ({ ...prev, [col.id]: !!v }))}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-[50vh] flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <div className="text-center">
            <h2 className="text-2xl font-bold">Loading...</h2>
            <p className="text-muted-foreground">Please wait while we fetch your words</p>
          </div>
        </div>
      ) : (
        <WordList
          words={filteredWords}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
        />
      )}
    </div>
  );
}