"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { getExportHeaders } from "@/lib/languages";
import type { UserLanguagePreferences } from "@/lib/languages";
import { MultiSelect } from "@/components/multi-select";
import { Checkbox } from "@/components/ui/checkbox";

export function ExportDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [exportAll, setExportAll] = useState(true);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [languagePrefs, setLanguagePrefs] = useState<UserLanguagePreferences | null>(null);

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

  const { data } = useQuery({
    queryKey: ["sections-stats"],
    queryFn: async () => {
      const response = await fetch("/api/words/sections");
      if (!response.ok) throw new Error("Failed to load sections");
      return response.json() as Promise<{ sections: string[]; sectionStats: { section: string; count: number }[] }>;
    },
  });

  const sectionStats = data?.sectionStats || [];
  const totalWordsAvailable = sectionStats.reduce((sum, s) => sum + s.count, 0);

  const numSelectedWords = exportAll
    ? totalWordsAvailable
    : selectedSections.reduce((sum, sec) => {
        const stat = sectionStats.find((s) => s.section === sec);
        return sum + (stat?.count || 0);
      }, 0);

  const handleExport = async () => {
    if (!exportAll && selectedSections.length === 0) {
      toast.error("Please select at least one section or choose 'Export all words'");
      return;
    }
    
    try {
      const payload: any = {};
      if (exportAll) {
        payload.all = true;
      } else {
        payload.sections = selectedSections;
      }

      const response = await fetch("/api/words/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to export words");
      }

      const contentDisposition = response.headers.get("Content-Disposition");
      const filename = contentDisposition
        ? contentDisposition.split("filename=")[1].replace(/"/g, "")
        : "recall-words.csv";
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Words exported successfully");
      setIsOpen(false);
      setExportAll(true);
      setSelectedSections([]);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export words");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Words</DialogTitle>
          <DialogDescription>
            Download your words as a CSV file.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex items-center gap-2">
            <Checkbox
              className="border border-border"
              id="export-all" 
              checked={exportAll} 
              onCheckedChange={(v) => {
                setExportAll(!!v);
                if (!!v) setSelectedSections([]);
              }} 
            />
            <Label htmlFor="export-all" className="cursor-pointer">Export all words</Label>
          </div>

          {!exportAll && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="section-select">Select Sections to Export</Label>
              <MultiSelect
                modalPopover
                options={sectionStats.map((s) => ({
                  value: s.section,
                  label: `Section ${s.section} (${s.count} words)`,
                }))}
                onValueChange={setSelectedSections}
                value={selectedSections}
                placeholder="Select sections"
              />
            </div>
          )}

          {/* Preview Section */}
          <div className="rounded-md bg-muted/50 p-3 space-y-2 text-sm mt-2">
            <div className="font-medium text-foreground">Export Preview:</div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">Rows to export:</span>
              <span className="font-medium">{numSelectedWords} word{numSelectedWords !== 1 ? 's' : ''}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">Sections:</span>
              <span className="font-medium">
                {exportAll ? "All Sections" : selectedSections.length > 0 ? `${selectedSections.length} selected` : "None"}
              </span>
            </div>
          </div>

          <Button 
            onClick={handleExport} 
            className="w-full"
            disabled={!exportAll && selectedSections.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export to CSV
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ImportDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const queryClient = useQueryClient();

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setIsImporting(true);
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/words/import", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to import words");
      }
      const result = await response.json();
      toast.success(result.message || "Imported words successfully");
      await queryClient.invalidateQueries({ queryKey: ["words"] });
      setIsOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import words");
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          Import
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Words</DialogTitle>
          <DialogDescription>
            Import words from a CSV file.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <Label htmlFor="file">Choose CSV file</Label>
          <Input
            id="file"
            type="file"
            accept=".csv"
            onChange={handleImport}
            disabled={isImporting}
          />
          {isImporting && (
            <p className="text-sm text-muted-foreground">Importing words...</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 