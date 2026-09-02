"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { memo, useEffect, useState } from "react";
import type { UserLanguagePreferences } from "@/lib/languages";

interface Session {
  id: string;
  type: string;
  direction: string;
  startedAt: string;
  completedAt: string | null;
  totalWords: number;
  correctAnswers: number;
  accuracy: number;
  duration: number | null;
  sections?: number[];
}

/**
 * Get direction label from direction code and language preferences
 */
function getDirectionLabel(direction: string, prefs: UserLanguagePreferences | null): string {
  if (!prefs) return direction.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  
  const main = prefs.mainLanguage;
  const trans1 = prefs.translationLanguages[0] || "Language 1";
  const trans2 = prefs.translationLanguages[1] || "Language 2";
  
  const labelMap: Record<string, string> = {
    "main_to_trans1": `${main} → ${trans1}`,
    "trans1_to_main": `${trans1} → ${main}`,
    "main_to_trans2": `${main} → ${trans2}`,
    "trans2_to_main": `${trans2} → ${main}`,
  };
  
  return labelMap[direction] || direction.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export function RecentSessions() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [languagePrefs, setLanguagePrefs] = useState<UserLanguagePreferences | null>(null);
  /** The session awaiting confirmation. Deleting history is not undoable, so
   *  it is never a single click. */
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null);

  // Fetch user language preferences on mount
  useEffect(() => {
    const fetchLanguagePreferences = async () => {
      try {
        const response = await fetch("/api/user/languages");
        if (response.ok) {
          const data = await response.json();
          setLanguagePrefs(data);
        }
      } catch (error) {
        console.error("Failed to fetch language preferences:", error);
      }
    };
    
    fetchLanguagePreferences();
  }, []);

  const { data: sessions, isLoading } = useQuery<Session[]>({
    queryKey: ["recent-sessions"],
    queryFn: async () => {
      const response = await fetch("/api/learn/sessions/recent");
      if (!response.ok) throw new Error("Failed to fetch recent sessions");
      return response.json();
    },
    refetchOnWindowFocus: false,
    refetchInterval: 60000, // Only refetch every 60 seconds
  });

  const deleteSession = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/learn/sessions/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete session");
      return response.json();
    },
    onSuccess: () => {
      // Stats and the streak both count completed sessions, so they are stale
      // the moment one is removed.
      queryClient.invalidateQueries({ queryKey: ["recent-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["learning-stats"] });
      setPendingDelete(null);
      toast.success("Session deleted");
    },
    onError: () => toast.error("Could not delete that session"),
  });



  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!sessions?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            No learning sessions yet. Start your first session to begin learning!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[50vh]">
      <div className="space-y-3">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border p-3 bg-card shadow-sm cursor-pointer hover:bg-accent/60 transition"
            onClick={() => {
              router.push(`/dashboard/learn/session/${session.id}`);
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-semibold text-base">
                  {session.type.charAt(0).toUpperCase() + session.type.slice(1)}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  {getDirectionLabel(session.direction, languagePrefs)}
                </span>
                {Array.isArray(session.sections) && session.sections.length > 0 ? (
                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                    Section{session.sections.length > 1 ? 's' : ''}: {session.sections.join(", ")}
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground opacity-60">
                    No section
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })}</span>
                {session.completedAt && session.duration !== null && (
                  <span>• {Math.round(session.duration / 60)} min</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <div className="flex flex-col items-end min-w-[90px]">
                {session.completedAt ? (
                  <>
                    <span className="font-semibold text-sm">
                      {session.correctAnswers}/{session.totalWords} correct
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(session.accuracy * 100)}% accuracy
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-primary font-semibold">In progress</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete this session"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={(event) => {
                  // The row itself opens the session; without this the delete
                  // button would navigate away as it opened the dialog.
                  event.stopPropagation();
                  setPendingDelete(session);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this session?</DialogTitle>
            <DialogDescription>
              This removes the session from your history. Your review schedule
              and mastery levels are not affected — only the record of this
              sitting is deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={deleteSession.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteSession.isPending}
              onClick={() => pendingDelete && deleteSession.mutate(pendingDelete.id)}
            >
              {deleteSession.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}

export const RecentSessionsMemo = memo(RecentSessions);