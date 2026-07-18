import { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportDialog, ImportDialog } from "@/components/words/export-import";
import { Download, Upload } from "lucide-react";

export const metadata: Metadata = {
  title: "Export/Import Words | Recall",
  description: "Export your words to CSV or import words from a CSV file",
};

export default function ExportImportPage() {
  return (
    <div className="container py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Export/Import Words</h1>
        <p className="text-muted-foreground mt-2">
          Export your word collection to CSV or import words from a CSV file
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Export Card */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Words
            </CardTitle>
            <CardDescription>
              Download your entire word collection as a CSV file
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">What&apos;s Included</h3>
                <ul className="text-sm space-y-2 list-disc list-inside text-muted-foreground">
                  <li>Main word (in your primary language)</li>
                  <li>Translation 1 (first translation language)</li>
                  <li>Translation 2 (second translation language)</li>
                  <li>Example sentences</li>
                  <li>Notes</li>
                  <li>Important flag</li>
                  <li>Section numbers</li>
                  <li>Creation and update dates</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-2">How to Use</h3>
                <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
                  <li>Click the Export button below</li>
                  <li>Save the CSV file to your computer</li>
                  <li>Open with Excel, Google Sheets, or any spreadsheet software</li>
                </ol>
              </div>
            </div>
            <div className="pt-6">
              <ExportDialog />
            </div>
          </CardContent>
        </Card>

        {/* Import Card */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import Words
            </CardTitle>
            <CardDescription>
              Import words from a properly formatted CSV file
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">File Requirements</h3>
                <ul className="text-sm space-y-2 list-disc list-inside text-muted-foreground">
                  <li>CSV format with UTF-8 encoding</li>
                  <li>Maximum 100 words per import</li>
                  <li>Required columns: mainWord, section</li>
                  <li>Optional columns: translation1, translation2, exampleSentence, notes, important</li>
                  <li>At least one translation is required</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-2">Format Example</h3>
                <div className="bg-muted p-3 rounded-md">
                  <code className="text-sm">
                    mainWord,translation1,
                    <br />
                    translation2,section<br />
                    Haus,house,বাড়ি,1<br />
                    Brot,bread,রুটি,1
                  </code>
                </div>
              </div>
            </div>
            <div className="pt-6">
              <ImportDialog />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 