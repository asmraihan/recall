"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { ChevronLeft, ChevronRight, Loader2, Upload, X } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ExportDialog } from "@/components/words/export-import";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useDebounce } from "@/hooks/use-debounce";
import { Columns3Cog } from "lucide-react";

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

interface WordResponse extends Omit<Word, "createdAt" | "updatedAt"> {
  createdAt: string;
  updatedAt: string;
}

interface WordsPage {
  items: Word[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PAGE_SIZE_OPTIONS = ["25", "50", "100", "200"];
const DEFAULT_PAGE_SIZE = "50";

export default function WordsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Depend on the string, not the object: URLSearchParams gets a new identity
  // on every navigation, which used to invalidate every useCallback below it.
  const searchParamsString = searchParams.toString();

  const section = searchParams.get("section");
  const filter = searchParams.get("filter") || "default";
  const urlSearch = searchParams.get("search") || "";
  const page = Math.max(Number.parseInt(searchParams.get("page") ?? "", 10) || 1, 1);
  const limit = searchParams.get("limit") || DEFAULT_PAGE_SIZE;

  const [searchInput, setSearchInput] = useState(urlSearch);
  const debouncedSearch = useDebounce(searchInput, 350);

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
    mainWord: true,
    translation1: true,
    translation2: true,
    section: true,
    exampleSentence: true,
    actions: true,
  });

  /**
   * Writes a set of query params in one navigation. Bails out when nothing
   * actually changes — without this guard the search effect re-fires on every
   * render caused by its own navigation.
   */
  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParamsString);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      const next = params.toString();
      if (next === searchParamsString) return;
      router.replace(`${pathname}?${next}`, { scroll: false });
    },
    [searchParamsString, pathname, router]
  );

  // Sections rarely change — cache them so a URL change can't refetch them.
  const { data: sections = [], isSuccess: sectionsLoaded } = useQuery<string[]>({
    queryKey: ["sections"],
    queryFn: async () => {
      const response = await fetch("/api/words/sections");
      if (!response.ok) throw new Error("Failed to load sections");
      const data = (await response.json()) as { sections: string[] };
      return data.sections;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Pick a default section exactly once, the first time sections arrive.
  const appliedDefaultSection = useRef(false);
  useEffect(() => {
    if (appliedDefaultSection.current || !sectionsLoaded) return;
    appliedDefaultSection.current = true;
    if (section == null && sections.length > 0) {
      updateParams({ section: sections[0] });
    }
  }, [sectionsLoaded, sections, section, updateParams]);

  // Push the debounced search term into the URL and reset to the first page.
  useEffect(() => {
    if (debouncedSearch === urlSearch) return;
    updateParams({ search: debouncedSearch || null, page: null });
  }, [debouncedSearch, urlSearch, updateParams]);

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<WordsPage>({
    queryKey: ["words", section, filter, urlSearch, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("section", section ?? "");
      if (filter !== "default") params.set("filter", filter);
      if (urlSearch) params.set("q", urlSearch);
      params.set("page", String(page));
      params.set("limit", limit);

      const response = await fetch(`/api/words?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to fetch words");
      }
      const body = (await response.json()) as Omit<WordsPage, "items"> & {
        items: WordResponse[];
      };
      return {
        ...body,
        items: body.items.map((word) => ({
          ...word,
          createdAt: new Date(word.createdAt),
          updatedAt: new Date(word.updatedAt),
        })),
      };
    },
    enabled: sectionsLoaded && !!section,
    retry: 1,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    // Keeps the previous page on screen while the next one loads, so paging
    // and typing never flash an empty table.
    placeholderData: keepPreviousData,
  });

  const words = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const selectedCount = Object.values(rowSelection).filter(Boolean).length;
  const rangeStart = total === 0 ? 0 : (page - 1) * Number(limit) + 1;
  const rangeEnd = Math.min(page * Number(limit), total);

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
          <p className="text-muted-foreground mt-2">Manage your vocabulary collection</p>
        </div>
        <div className="flex gap-2">
          <ExportDialog
            selectedIds={Object.keys(rowSelection).filter((id) => rowSelection[id])}
            visibleColumns={[
              ...Object.keys(columnVisibility).filter(
                (k) => columnVisibility[k] && k !== "actions"
              ),
              "important", // always exported so the flag round-trips (not a toggleable column)
            ]}
            section={section ?? undefined}
            totalWords={total}
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
              placeholder="Search all words..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pr-24 w-full"
            />
            <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {isFetching && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
              {searchInput && (
                <>
                  <span className="select-none bg-background px-1 text-xs text-muted-foreground">
                    {total} found
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchInput("")}
                    aria-label="Clear search"
                    className="pointer-events-auto rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              {!searchInput && selectedCount > 0 && (
                <span className="select-none bg-background px-1 text-xs text-muted-foreground">
                  {selectedCount} selected
                </span>
              )}
            </div>
          </div>

          <SingleSelect
            value={section ?? undefined}
            onValueChange={(value) => updateParams({ section: value, page: null })}
            options={[
              { value: "all", label: "All Sections" },
              ...sections.map((sectionValue) => ({
                value: sectionValue,
                label: `Section ${sectionValue}`,
              })),
            ]}
            className="w-[180px]"
          />

          <SingleSelect
            value={filter}
            onValueChange={(value) => updateParams({ filter: value, page: null })}
            options={[
              { value: "default", label: "Normal" },
              { value: "important", label: "Important" },
              { value: "mistakes", label: "Mistakes" },
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
                  onCheckedChange={(v) =>
                    setColumnVisibility((prev) => ({ ...prev, [col.id]: !!v }))
                  }
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
      ) : total === 0 ? (
        <div className="flex h-[40vh] flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center">
          <p className="font-medium">No words found</p>
          <p className="text-sm text-muted-foreground">
            {urlSearch
              ? `Nothing matches "${urlSearch}" in this view.`
              : "Try a different section or filter."}
          </p>
        </div>
      ) : (
        <>
          <WordList
            words={words}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
          />

          <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{rangeStart}</span>–
              <span className="font-medium text-foreground">{rangeEnd}</span> of{" "}
              <span className="font-medium text-foreground">{total}</span>
            </p>

            <div className="flex items-center gap-2">
              <SingleSelect
                value={limit}
                onValueChange={(value) => updateParams({ limit: value, page: null })}
                options={PAGE_SIZE_OPTIONS.map((size) => ({
                  value: size,
                  label: `${size} / page`,
                }))}
                className="w-[130px]"
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous page"
                disabled={page <= 1 || isFetching}
                onClick={() => updateParams({ page: page <= 2 ? null : String(page - 1) })}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[5.5rem] text-center text-sm tabular-nums">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next page"
                disabled={page >= totalPages || isFetching}
                onClick={() => updateParams({ page: String(page + 1) })}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
