import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetTopContent, useUpdateTopContent, getGetTopContentQueryKey } from "@workspace/api-client-react";
import { uploadImage } from "@/lib/uploads";
import { BRAND_NAME } from "@/lib/branding";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, ImageIcon, Loader2, X } from "lucide-react";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function TopContentPage() {
  const queryClient = useQueryClient();
  const { data: topContent } = useGetTopContent();
  const updateTopContentMutation = useUpdateTopContent();

  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [savedLogoUrl, setSavedLogoUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!topContent) return;
    const nextContent = topContent.content ?? "";
    const nextLogoUrl = topContent.logoUrl ?? "";
    setSavedContent(nextContent);
    setSavedLogoUrl(nextLogoUrl);
    setContent((currentValue) => (currentValue ? currentValue : nextContent));
    setLogoPreview((currentValue) => (currentValue ? currentValue : nextLogoUrl));
  }, [topContent]);

  const handleLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please select an image file.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image under 5 MB.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const clearPendingLogo = () => {
    setLogoFile(null);
    setLogoPreview(savedLogoUrl);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

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
      const finalLogoUrl = logoFile ? await uploadImage(logoFile) : savedLogoUrl;

      await updateTopContentMutation.mutateAsync({
        data: { content: content.trim(), logoUrl: finalLogoUrl },
      });
      await queryClient.invalidateQueries({ queryKey: getGetTopContentQueryKey() });

      setSavedLogoUrl(finalLogoUrl);
      setLogoPreview(finalLogoUrl);
      setLogoFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
            <Label htmlFor="top-logo">Logo Upload <span className="text-gray-400">(optional)</span></Label>
            <Input
              ref={fileInputRef}
              id="top-logo"
              type="file"
              accept="image/*"
              className="mt-1"
              onChange={handleLogoChange}
            />
            <p className="mt-2 text-xs text-gray-500">
              Uploading a new logo is optional. If you do not upload one, the existing logo will continue to be used.
            </p>

            <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
              {logoPreview ? (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white">
                      <img src={logoPreview} alt="Top section logo preview" className="h-full w-full object-contain" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {logoFile ? "New logo selected" : "Current saved logo"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {logoFile ? "Save changes to apply this logo." : "This logo will remain if you don't upload a new one."}
                      </p>
                    </div>
                  </div>

                  {logoFile && (
                    <Button type="button" variant="outline" size="sm" onClick={clearPendingLogo}>
                      <X className="mr-1 h-4 w-4" />
                      Remove
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-white">
                    <ImageIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">No logo uploaded yet</p>
                    <p className="text-xs text-gray-500">You can skip this for now and keep using text only.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

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
            {savedLogoUrl && (
              <div className="mt-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white">
                <img src={savedLogoUrl} alt="Saved top section logo" className="h-full w-full object-contain" />
              </div>
            )}
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
              {savedContent || "No top content saved yet."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
