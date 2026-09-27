import { Metadata } from "next";
import { BatchAddForm } from "@/components/words/batch-add-form";

export const metadata: Metadata = {
  title: "Batch Add Words | Recall",
  description: "Add multiple words to your vocabulary collection at once",
};

export default function BatchAddPage() {
  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Batch Add Words</h1>
        <p className="mt-2 text-muted-foreground">
          Paste a whole chapter in one place. CSV is detected and cleaned up automatically;
          unformatted text uses AI formatting.
        </p>
      </div>
      <BatchAddForm />
    </div>
  );
}
