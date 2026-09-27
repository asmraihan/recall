"use client";

import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { MultiSelect } from "@/components/multi-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DeleteSectionWords() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmedSections, setConfirmedSections] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const busy = useRef(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["sections", "delete-preview"],
    queryFn: async () => {
      const response = await fetch("/api/words/sections");
      if (!response.ok) throw new Error("Could not load sections");
      return response.json() as Promise<{ sections: string[]; sectionStats: { section: string; count: number }[] }>;
    },
    // Refresh counts when opening this screen.
    staleTime: 0,
  });
  const available = Array.isArray(data?.sectionStats) ? data.sectionStats : [];
  const validSelection = selected.filter((section) => available.some((item) => item.section === section));
  const selectedCount = available.filter((item) => validSelection.includes(item.section)).reduce((sum, item) => sum + item.count, 0);

  const remove = async () => {
    if (!confirmedSections?.length || busy.current) return;
    busy.current = true; setDeleting(true);
    try {
      const response = await fetch("/api/words/delete-sections", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: confirmedSections }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete words");
      toast.success(result.message);
      setSelected([]); setConfirmedSections(null);
      await queryClient.invalidateQueries();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete words");
    } finally { busy.current = false; setDeleting(false); }
  };

  return <div className="space-y-3 rounded-lg border border-destructive/20 p-4">
    <div className="space-y-1">
      <h4 className="text-sm font-semibold">Delete Words by Section</h4>
      <p className="text-sm text-muted-foreground">Choose chapters to remove from your vocabulary. Words in other sections stay in your account.</p>
    </div>
    <Label htmlFor="delete-word-sections">Sections to delete</Label>
    <MultiSelect id="delete-word-sections" value={validSelection} onValueChange={setSelected}
      options={available.map((item) => ({ value: item.section, label: `Section ${item.section} · ${item.count} words` }))}
      placeholder={isLoading ? "Loading sections..." : "Select sections"} disabled={isLoading || deleting || !!confirmedSections || isError} maxCount={4} />
    {isError && <p className="text-sm text-destructive">Could not load sections. <button className="underline" onClick={() => refetch()}>Retry</button></p>}
    {!isLoading && !isError && available.length === 0 && <p className="text-sm text-muted-foreground">No sections with words to delete.</p>}
    <Button variant="destructive" size="sm" disabled={!validSelection.length || deleting} onClick={() => setConfirmedSections([...validSelection])}>
      <Trash2 className="mr-2 h-4 w-4" />Delete selected words{selectedCount > 0 ? ` (${selectedCount})` : ""}
    </Button>
    <Dialog open={confirmedSections !== null} onOpenChange={(open) => { if (!open && !deleting) setConfirmedSections(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete words from selected sections?</DialogTitle>
          <DialogDescription>
            This permanently deletes all words in the selected sections and their learning progress. Session history will be updated; sessions left with no words will be removed. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <p className="max-h-40 overflow-auto text-sm">Sections: {confirmedSections?.join(", ")}</p>
        <p className="text-sm text-muted-foreground">Currently {selectedCount} words. Any words added to these sections before you confirm will also be deleted.</p>
        <DialogFooter>
          <Button variant="outline" disabled={deleting} onClick={() => setConfirmedSections(null)}>Cancel</Button>
          <Button variant="destructive" disabled={deleting} onClick={remove}>{deleting ? "Deleting..." : "Delete selected words"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
