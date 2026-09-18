"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MultiSelect } from "@/components/multi-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import type { UserLanguagePreferences } from "@/lib/languages";

type SessionMode = "review" | "new" | "mistakes" | "custom" | "important" | "randomized";
const EMPTY_SECTIONS: string[] = [];

interface StartSessionDialogProps {
  children?: React.ReactNode;
  mode?: SessionMode;
  /** Preselect sections when this dialog is opened from a section-specific view. */
  initialSections?: string[];
  /** The number shown initially for a custom session. */
  initialCustomWordCount?: number;
  /** Optional UI cap for a context such as the currently visible page. */
  maxCustomWordCount?: number;
  /**
   * Explicit word IDs from the current paginated page. When provided the
   * session will be created from exactly these words (or a slice of them)
   * instead of querying the section at random.
   */
  pageWordIds?: string[];
}

export function StartSessionDialog({
  children,
  mode = "new",
  initialSections = EMPTY_SECTIONS,
  initialCustomWordCount,
  maxCustomWordCount,
  pageWordIds,
}: StartSessionDialogProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [sessionType, setSessionType] = useState<SessionMode>(mode);
  const [direction, setDirection] = useState<string>("");
  const [languagePrefs, setLanguagePrefs] = useState<UserLanguagePreferences | null>(null);
  const [directionOptions, setDirectionOptions] = useState<Array<{value: string; label: string}>>([]);
  // MultiSelect returns string[]; store as string[] in state
  const [section, setSection] = useState<string[]>(initialSections);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [customMode, setCustomMode] = useState<"randomized" | "mistakes" | "important">("randomized");
  const [customWordCount, setCustomWordCount] = useState<string>(
    initialCustomWordCount ? String(initialCustomWordCount) : ""
  );
  const [selectAll, setSelectAll] = useState(false);

  // The words page supplies a section and the size of its visible page. Reset
  // these preset values before it opens, while leaving the dashboard's
  // existing dialog behaviour unchanged.
  const handleOpenChange = (nextOpen: boolean) => {
    const hasPreset = initialSections.length > 0 || initialCustomWordCount !== undefined;
    if (nextOpen && hasPreset) {
      setSessionType(mode);
      setSection(initialSections);
      setSectionError(null);
      setSelectAll(false);
      setCustomWordCount(initialCustomWordCount ? String(initialCustomWordCount) : "");
    }
    setOpen(nextOpen);
  };

  // Fetch user language preferences
  useEffect(() => {
    const fetchLanguagePreferences = async () => {
      try {
        const response = await fetch("/api/user/languages");
        if (response.ok) {
          const data = await response.json();
          setLanguagePrefs(data);
          
          // Generate direction options from language preferences
          const main = data.mainLanguage;
          const trans1 = data.translationLanguages[0] || "Language 1";
          const trans2 = data.translationLanguages[1] || "Language 2";
          
          const options = [
            { value: "main_to_trans1", label: `${main} → ${trans1}` },
            { value: "trans1_to_main", label: `${trans1} → ${main}` },
            { value: "main_to_trans2", label: `${main} → ${trans2}` },
            { value: "trans2_to_main", label: `${trans2} → ${main}` },
          ];
          
          setDirectionOptions(options);
          setDirection(options[0].value);
        }
      } catch (error) {
        console.error("Failed to fetch language preferences:", error);
      }
    };
    
    fetchLanguagePreferences();
  }, []);

  // Fetch available sections
  const { data: sectionsData, isLoading: isLoadingSections } = useQuery({
    queryKey: ["sections"],
    queryFn: async () => {
      const response = await fetch("/api/words/sections");
      if (!response.ok) throw new Error("Failed to fetch sections");
      const data = await response.json();
      return data.sections;
    },
  });
  // console.log("Available sections:", sectionsData);
  const handleStartSession = async () => {
    if (section.length === 0) {
      setSectionError("Please select at least one section.");
      return;
    } else {
      setSectionError(null);
    }
    if (!session?.user?.id) {
      toast.error("Please sign in to start a learning session");
      return;
    }
    setIsStarting(true);
    try {
      let body: any = {
        type: sessionType,
        direction,
        sections: section,
      };
      if (sessionType === "important") {
        body = { type: "important", direction };
      }
      if (sessionType === "custom") {
        const requestedCount = Number(customWordCount) || 20;
        const wordCount = maxCustomWordCount
          ? Math.min(Math.max(requestedCount, 1), maxCustomWordCount)
          : requestedCount;

        if (selectAll) {
          // "Select All" → use all words in the section (no wordIds constraint)
          body = {
            type: customMode,
            direction,
            sections: section,
            wordCount: "all",
          };
        } else if (pageWordIds && pageWordIds.length > 0) {
          // Page-specific session: send the exact word IDs from the visible page
          body = {
            type: customMode,
            direction,
            sections: section,
            wordIds: pageWordIds.slice(0, wordCount),
          };
        } else {
          body = {
            type: customMode,
            direction,
            sections: section,
            wordCount,
          };
        }
      }
      const response = await fetch("/api/learn/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let errorMsg = "Failed to start learning session";
        try {
          const errorData = await response.json();
          if (errorData?.error) errorMsg = errorData.error;
        } catch {}
        throw new Error(errorMsg);
      }

      const data = await response.json();
      setOpen(false);
      router.push(`/dashboard/learn/session/${data.sessionId}`);
    } catch (error) {
      console.error("Error starting session:", error);
      toast.error(error instanceof Error ? error.message : "Failed to start learning session");
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || <Button className="cursor-pointer">Start Learning</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="hidden">
          <DialogTitle>
            Start Learning Session
            </DialogTitle>
          <DialogDescription>
            Choose your learning preferences to start a new session
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="session-type">Session Type</Label>
            <Select
              value={sessionType}
              onValueChange={(value: SessionMode) => setSessionType(value)}
            >
              <SelectTrigger id="session-type">
                <SelectValue placeholder="Select session type" />
              </SelectTrigger>
              <SelectContent 
              className="max-w-md"
              >
                <SelectItem value="new">Learn New Words</SelectItem>
                {/* <SelectItem value="randomized">Randomized Session</SelectItem> */}
                <SelectItem value="mistakes">Practice Mistakes</SelectItem>
                <SelectItem value="review">Review Due Words</SelectItem>
                {/* <SelectItem value="important">Important Words</SelectItem> */}
                <SelectItem value="custom">Custom Session</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {sessionType === "custom" && (
            <div className="flex flex-col gap-4 border p-4 rounded-md bg-muted/30">
              <div className="flex flex-col gap-2">
                <Label>Custom Session Mode</Label>
                <RadioGroup
                  value={customMode}
                  onValueChange={value => setCustomMode(value as "randomized" | "mistakes" | "important")}
                  className="flex flex-col sm:flex-row gap-2 sm:gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="randomized" id="custom-randomized" />
                    <Label htmlFor="custom-randomized">Randomized</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="mistakes" id="custom-mistakes" />
                    <Label htmlFor="custom-mistakes">Mistakes</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="important" id="custom-important" />
                    <Label htmlFor="custom-important">Important</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                <Label htmlFor="custom-word-count">Number of Words</Label>
                <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full">
                  <Input
                    id="custom-word-count"
                    type="number"
                    min={1}
                    max={maxCustomWordCount}
                    value={selectAll ? "" : customWordCount}
                    onChange={e => {
                      const input = e.target.value;
                      const parsed = Number(input);
                      const bounded = maxCustomWordCount && parsed > maxCustomWordCount
                        ? String(maxCustomWordCount)
                        : input;
                      setCustomWordCount(bounded);
                      setSelectAll(false);
                    }}
                    placeholder={maxCustomWordCount ? `1–${maxCustomWordCount}` : "e.g. 20 (default)"}
                    disabled={selectAll}
                    className="w-full sm:w-32"
                  />
                  <Button
                    type="button"
                    variant={selectAll ? "default" : "outline"}
                    onClick={() => {
                      setSelectAll(!selectAll);
                      if (!selectAll) setCustomWordCount("");
                    }}
                    className="w-full sm:w-auto"
                  >
                    {selectAll ? "All" : "Select All"}
                  </Button>
                </div>
                {maxCustomWordCount && !selectAll && (
                  <p className="text-xs text-muted-foreground">
                    Choose 1–{maxCustomWordCount} words from this page, or select all words in the section.
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="direction">Learning Direction</Label>
            <Select
              value={direction}
              onValueChange={setDirection}
            >
              <SelectTrigger id="direction">
                <SelectValue placeholder="Select learning direction" />
              </SelectTrigger>
              <SelectContent className="max-w-md">
                {directionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="section">Sections</Label>
            <MultiSelect
            modalPopover
              options={
                sectionsData?.map((section: string) => ({
                  value: section,
                  label: `Section ${section}`
                })) || []
              }
              onValueChange={(values) => {
                setSection(values);
                if (values.length > 0) setSectionError(null);
              }}
              value={section}
              defaultValue={initialSections}
              placeholder="Select sections"
              maxCount={5}
            />
            {isLoadingSections && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading sections...
              </div>
            )}
            {sectionError && (
              <div className="text-sm text-red-500">{sectionError}</div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleStartSession}
            disabled={isStarting || section.length === 0}
            className="cursor-pointer"
          >
            {isStarting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting Session...
              </>
            ) : (
              "Start Session"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
