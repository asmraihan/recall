"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { SUPPORTED_LANGUAGES, type UserLanguagePreferences } from "@/lib/languages";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { VoiceCombobox, type Voice } from "@/components/ui/voice-combobox";

export default function SettingsPage() {
  const router = useRouter();
  const [isDeleteSessionsDialogOpen, setIsDeleteSessionsDialogOpen] = useState(false);
  const [isDeleteWordsDialogOpen, setIsDeleteWordsDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [languagePrefs, setLanguagePrefs] = useState<UserLanguagePreferences | null>(null);
  const [isLoadingLanguages, setIsLoadingLanguages] = useState(true);
  const [isSavingLanguages, setIsSavingLanguages] = useState(false);
  const [mainLanguage, setMainLanguage] = useState("");
  const [translationLang1, setTranslationLang1] = useState("");
  const [translationLang2, setTranslationLang2] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [preferredVoice, setPreferredVoice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchLanguagePreferences = async () => {
      try {
        const response = await fetch("/api/user/languages");
        if (response.ok) {
          const data = await response.json();
          setLanguagePrefs(data);
          setMainLanguage(data.mainLanguage);
          setTranslationLang1(data.translationLanguages[0] || "");
          setTranslationLang2(data.translationLanguages[1] || "");
        }
      } catch (error) {
        console.error("Failed to fetch language preferences:", error);
        toast.error("Failed to load language preferences");
      } finally {
        setIsLoadingLanguages(false);
      }
    };
    fetchLanguagePreferences();
  }, []);

  useEffect(() => {
    const fetchVoices = async () => {
      try {
        const response = await fetch("/api/tts");
        if (response.ok) {
          const data = await response.json();
          setVoices(data.voices);
        }
      } catch (error) {
        console.error("Failed to fetch voices:", error);
        toast.error("Failed to load available voices");
      } finally {
        setIsLoadingVoices(false);
      }
    };

    const fetchUserVoicePreference = async () => {
      try {
        const response = await fetch("/api/user/voice");
        if (response.ok) {
          const data = await response.json();
          setPreferredVoice(data.preferredVoice || "");
        }
      } catch (error) {
        console.error("Failed to fetch user voice preference:", error);
      }
    };

    fetchVoices();
    fetchUserVoicePreference();
  }, []);

  const handleSavePreferences = async () => {
    if (!mainLanguage || !translationLang1 || !translationLang2) {
      toast.error("Please select all languages");
      return;
    }

    if (mainLanguage === translationLang1 || mainLanguage === translationLang2 || translationLang1 === translationLang2) {
      toast.error("Please select different languages");
      return;
    }

    setIsSaving(true);
    try {
      const [languageResponse, voiceResponse] = await Promise.all([
        fetch("/api/user/languages", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mainLanguage,
            translationLanguages: [translationLang1, translationLang2],
          }),
        }),
        preferredVoice ? fetch("/api/user/voice", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preferredVoice,
          }),
        }) : Promise.resolve({ ok: true }),
      ]);

      if (!languageResponse.ok) {
        throw new Error("Failed to save language preferences");
      }

      if (!voiceResponse.ok) {
        throw new Error("Failed to save voice preference");
      }

      const data = await languageResponse.json();
      setLanguagePrefs({
        mainLanguage: data.mainLanguage,
        translationLanguages: data.translationLanguages,
      });
      toast.success("Preferences updated successfully");
      router.refresh();
    } catch (error) {
      console.error("Error saving preferences:", error);
      toast.error("Failed to save preferences");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSessions = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch("/api/learn/sessions/delete-all", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete sessions");
      }

      toast.success("All learning sessions deleted successfully");
      setIsDeleteSessionsDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast.error("Failed to delete sessions");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteWords = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch("/api/words/delete-all", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete words");
      }

      toast.success("All words deleted successfully");
      setIsDeleteWordsDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast.error("Failed to delete words");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Tabs defaultValue="languages" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="languages">Languages</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="danger">Account Reset</TabsTrigger>
        </TabsList>

        <TabsContent value="languages">
          <Card>
            <CardHeader>
              <CardTitle>Language Preferences</CardTitle>
              <CardDescription>
                Configure which languages you want to learn with
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingLanguages ? (
                <div className="text-center py-4 text-muted-foreground">Loading language preferences...</div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="mainLanguage">Main Language (the language you're learning)</Label>
                    <Select value={mainLanguage} onValueChange={setMainLanguage}>
                      <SelectTrigger id="mainLanguage">
                        <SelectValue placeholder="Select main language" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <SelectItem key={lang} value={lang}>
                            {lang}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      This is the language you're learning (e.g., German if you're learning German)
                    </p>
                  </div>


                  <div className="space-y-2">
                    <Label htmlFor="translationLang1">First Translation Language</Label>
                    <Select value={translationLang1} onValueChange={setTranslationLang1}>
                      <SelectTrigger id="translationLang1">
                        <SelectValue placeholder="Select first translation language" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <SelectItem key={lang} value={lang}>
                            {lang}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      The first translation language for vocabulary entries
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="translationLang2">Second Translation Language</Label>
                    <Select value={translationLang2} onValueChange={setTranslationLang2}>
                      <SelectTrigger id="translationLang2">
                        <SelectValue placeholder="Select second translation language" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <SelectItem key={lang} value={lang}>
                            {lang}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      The second translation language for vocabulary entries (optional but recommended)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="preferredVoice">Preferred Voice (for pronunciation)</Label>
                    {isLoadingVoices ? (
                      <div className="text-sm text-muted-foreground">Loading voices...</div>
                    ) : (
                         <div className="text-sm text-wrap text-muted-foreground">
                      <VoiceCombobox
                        voices={voices}
                        value={preferredVoice}
                        onSelect={setPreferredVoice}
                        isLoading={isLoadingVoices}
                      />
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Select the voice used for text-to-speech pronunciation in learning sessions
                    </p>
                  </div>

                  <Button 
                    onClick={handleSavePreferences} 
                    disabled={isSaving}
                    className="w-full"
                  >
                    {isSaving ? "Saving..." : "Save Preferences"}
                  </Button>

                  {languagePrefs && (
                    <div className="bg-muted/50 p-4 rounded-lg text-sm">
                      <p><strong>Current Settings:</strong></p>
                      <p>Main Language: <strong>{languagePrefs.mainLanguage}</strong></p>
                      <p>Translation Languages: <strong>{languagePrefs.translationLanguages.join(", ")}</strong></p>
                      <p>Preferred Voice: <strong>{preferredVoice || "Default"}</strong></p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>User Profile</CardTitle>
              <CardDescription>
                Manage your account settings and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Profile settings will be implemented soon.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="danger">
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Reset Account</CardTitle>
              <CardDescription>
                These actions are irreversible and will permanently delete your data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row items-end justify-between gap-4 p-4 border rounded-lg border-destructive/20">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">Delete All Learning Sessions</h4>
                  <p className="text-sm text-muted-foreground">
                    This will permanently delete all your learning sessions and progress
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsDeleteSessionsDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Sessions
                </Button>
              </div>

              <div className="flex flex-col md:flex-row items-end justify-between gap-4 p-4 border rounded-lg border-destructive/20">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">Delete All Words</h4>
                  <p className="text-sm text-muted-foreground">
                    This will permanently delete all words you have added
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsDeleteWordsDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Words
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Sessions Confirmation Dialog */}
      <Dialog open={isDeleteSessionsDialogOpen} onOpenChange={setIsDeleteSessionsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete All Learning Sessions
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete all your learning sessions
              and reset your learning progress.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteSessionsDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSessions}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete All Sessions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Words Confirmation Dialog */}
      <Dialog open={isDeleteWordsDialogOpen} onOpenChange={setIsDeleteWordsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete All Words
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete all words you have added
              to your vocabulary collection.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteWordsDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteWords}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete All Words"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}