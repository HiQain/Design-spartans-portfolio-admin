import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { BRAND_NAME } from "@/lib/branding";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Loader2 } from "lucide-react";

interface TopContentDoc {
  content?: string;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function TopContentPage() {
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "topContent", "primary"), (snapshot) => {
      const data = snapshot.data() as TopContentDoc | undefined;
      const nextContent = data?.content ?? "";
      setSavedContent(nextContent);
      setContent((currentValue) => (currentValue ? currentValue : nextContent));
    });

    return unsubscribe;
  }, []);

  const handleSaveContent = async () => {
    if (!content.trim()) {
      toast({
        title: "Content required",
        description: "Please add top content before saving.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      await setDoc(doc(db, "topContent", "primary"), {
        content: content.trim(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Top content updated." });
    } catch (error) {
      toast({
        title: "Error",
        description: getErrorMessage(error, "Failed to save top content."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Top Content</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage the top section copy shown for {BRAND_NAME}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Section Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="top-content">Content</Label>
            <Textarea
              id="top-content"
              rows={5}
              className="mt-1 resize-none"
              placeholder="Add top section content here..."
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSaveContent} disabled={saving || !content.trim()}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Content"
              )}
            </Button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-gray-700">
              <FileText className="h-4 w-4" />
              <span className="text-sm font-medium">Saved Preview</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
              {savedContent || "No top content saved yet."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
