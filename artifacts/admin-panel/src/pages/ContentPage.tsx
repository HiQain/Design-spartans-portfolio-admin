import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCategories,
  useListMedia,
  useCreateMedia,
  useUpdateMedia,
  useDeleteMedia,
  getListMediaQueryKey,
  type Media,
} from "@workspace/api-client-react";
import { uploadImage } from "@/lib/uploads";
import { BRAND_NAME } from "@/lib/branding";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageIcon, Loader2, Pencil, Trash2, Upload } from "lucide-react";

// No pagination in the admin view (matches the old realtime-listener behavior of
// loading everything at once) - the collection is small enough that a high limit
// effectively means "all of it".
const ADMIN_MEDIA_LIMIT = 1000;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

interface PendingFile {
  id: string;
  file: File;
  preview: string;
}

export default function ContentPage() {
  const queryClient = useQueryClient();
  const { data: categoriesData } = useListCategories();
  const categories = categoriesData ?? [];
  const { data: mediaPage } = useListMedia({ limit: ADMIN_MEDIA_LIMIT });
  const mediaItems = [...(mediaPage?.items ?? [])].sort((a, b) => b.createdAt - a.createdAt);

  const createMediaMutation = useCreateMedia();
  const updateMediaMutation = useUpdateMedia();
  const deleteMediaMutation = useDeleteMedia();

  const invalidateMedia = () =>
    queryClient.invalidateQueries({ queryKey: getListMediaQueryKey({ limit: ADMIN_MEDIA_LIMIT }) });

  const [mediaTitle, setMediaTitle] = useState("");
  const [mainCategoryId, setMainCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [savingMedia, setSavingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [editingMediaId, setEditingMediaId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const mainCategories = categories.filter((category) => !category.parentId);
  const subCategories = categories.filter((category) => category.parentId === mainCategoryId);
  const requiresSubCategory = mainCategoryId !== "" && subCategories.length > 0;

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview("");
    pendingFiles.forEach((pending) => URL.revokeObjectURL(pending.preview));
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetMediaForm = () => {
    setMediaTitle("");
    setMainCategoryId("");
    setSubCategoryId("");
    setEditingMediaId(null);
    clearMedia();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) return;

    const validFiles: File[] = [];

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file",
          description: `${file.name} is not an image file.`,
          variant: "destructive",
        });
        continue;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} is over 5MB.`,
          variant: "destructive",
        });
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (editingMediaId || validFiles.length === 1) {
      const file = validFiles[0];
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
      setPendingFiles([]);
    } else {
      setMediaFile(null);
      setMediaPreview("");
      setPendingFiles(
        validFiles.map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
          file,
          preview: URL.createObjectURL(file),
        })),
      );
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingFile = (id: string) => {
    setPendingFiles((prev) => {
      const target = prev.find((pending) => pending.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((pending) => pending.id !== id);
    });
  };

  const isBulkUpload = !editingMediaId && pendingFiles.length > 0;
  const hasSelectedMedia = Boolean(mediaFile) || pendingFiles.length > 0;

  const handleSaveMedia = async () => {
    if (!mainCategoryId || (!editingMediaId && !hasSelectedMedia)) {
      toast({
        title: "Missing fields",
        description: "Category and image are required.",
        variant: "destructive",
      });
      return;
    }

    if (requiresSubCategory && !subCategoryId) {
      toast({
        title: "Subcategory required",
        description: "Please select a subcategory for this main category.",
        variant: "destructive",
      });
      return;
    }

    setSavingMedia(true);

    const mainCategory = categories.find((category) => category.id === mainCategoryId);
    const subCategory = categories.find((category) => category.id === subCategoryId);
    const selectedCategory = subCategory ?? mainCategory;

    const basePayload = {
      categoryId: selectedCategory?.id,
      categoryName: selectedCategory?.name,
      mainCategoryId: mainCategory?.id,
      mainCategoryName: mainCategory?.name,
      subCategoryId: subCategory?.id,
      subCategoryName: subCategory?.name,
    };

    try {
      if (isBulkUpload) {
        let uploaded = 0;
        let failed = 0;
        setUploadProgress({ current: 0, total: pendingFiles.length });

        for (const pending of pendingFiles) {
          try {
            const imageUrl = await uploadImage(pending.file);
            await createMediaMutation.mutateAsync({
              data: { ...basePayload, title: mediaTitle.trim(), imageUrl },
            });
            uploaded += 1;
          } catch {
            failed += 1;
          } finally {
            setUploadProgress((prev) => (prev ? { ...prev, current: prev.current + 1 } : prev));
          }
        }

        if (uploaded > 0) {
          await invalidateMedia();
          toast({
            title: `${uploaded} media item${uploaded === 1 ? "" : "s"} uploaded successfully.`,
            description: failed > 0 ? `${failed} file(s) failed to upload.` : undefined,
          });
        }

        if (failed > 0 && uploaded === 0) {
          toast({
            title: "Error",
            description: "Failed to upload media.",
            variant: "destructive",
          });
        }

        resetMediaForm();
      } else {
        const imageUrl = mediaFile ? await uploadImage(mediaFile) : mediaPreview;
        const payload = { ...basePayload, title: mediaTitle.trim(), imageUrl };

        if (editingMediaId) {
          await updateMediaMutation.mutateAsync({ id: editingMediaId, data: payload });
          toast({ title: "Media updated successfully." });
        } else {
          await createMediaMutation.mutateAsync({ data: payload });
          toast({ title: "Media uploaded successfully." });
        }

        await invalidateMedia();
        resetMediaForm();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: getErrorMessage(error, "Failed to upload media."),
        variant: "destructive",
      });
    } finally {
      setSavingMedia(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteMedia = async (id: string) => {
    try {
      await deleteMediaMutation.mutateAsync({ id });
      await invalidateMedia();
      toast({ title: "Media deleted." });
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete media.",
        variant: "destructive",
      });
    }
  };

  const handleEditMedia = (item: Media) => {
    setEditingMediaId(item.id);
    setMediaTitle(item.title ?? "");
    setMainCategoryId(item.mainCategoryId || item.categoryId || "");
    setSubCategoryId(item.subCategoryId || "");
    setMediaPreview(item.imageUrl || "");
    setMediaFile(null);
    pendingFiles.forEach((pending) => URL.revokeObjectURL(pending.preview));
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredMediaItems = mediaItems.filter((item) => {
    if (!normalizedQuery) return true;

    return [
      item.title,
      item.categoryName,
      item.mainCategoryName,
      item.subCategoryName,
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedQuery));
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Content</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage uploaded media for {BRAND_NAME}
        </p>
      </div>

      <Card ref={formCardRef} className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">
            {editingMediaId ? "Edit Media" : "Upload Media"}
          </CardTitle>
          {!editingMediaId && (
            <p className="text-sm text-gray-500">
              Select multiple images to bulk upload them all under the same category.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="media-main-category">Main Category</Label>
            <select
              id="media-main-category"
              value={mainCategoryId}
              onChange={(event) => {
                setMainCategoryId(event.target.value);
                setSubCategoryId("");
              }}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select main category</option>
              {mainCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {mainCategoryId && subCategories.length > 0 && (
            <div>
              <Label htmlFor="media-sub-category">Subcategory <span className="text-red-500">*</span></Label>
              <select
                id="media-sub-category"
                value={subCategoryId}
                onChange={(event) => setSubCategoryId(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select subcategory</option>
                {subCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label>{editingMediaId ? "Media File" : "Media File(s)"}</Label>
            <input
              ref={fileInputRef}
              id="media-upload"
              type="file"
              accept="image/*"
              multiple={!editingMediaId}
              className="hidden"
              onChange={handleFileChange}
            />

            {pendingFiles.length > 0 ? (
              <div className="mt-2">
                <label
                  htmlFor="media-upload"
                  className="mb-3 flex h-20 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-blue-400 hover:bg-blue-50"
                >
                  <Upload className="mb-1 h-5 w-5 text-gray-300" />
                  <p className="text-xs text-gray-500">Add more images ({pendingFiles.length} selected)</p>
                </label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {pendingFiles.map((pending) => (
                    <div key={pending.id} className="group relative overflow-hidden rounded-lg border border-gray-200">
                      <img
                        src={pending.preview}
                        alt={pending.file.name}
                        className="h-24 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePendingFile(pending.id)}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label={`Remove ${pending.file.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : !mediaPreview ? (
              <label
                htmlFor="media-upload"
                className="mt-2 flex h-36 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-blue-400 hover:bg-blue-50"
              >
                <Upload className="mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-600">
                  {editingMediaId ? "Click to upload media" : "Click to upload media (select multiple to bulk upload)"}
                </p>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF, WebP up to 5MB</p>
              </label>
            ) : (
              <div className="mt-3 inline-block overflow-hidden rounded-xl border border-gray-200">
                <img
                  src={mediaPreview}
                  alt="Selected media preview"
                  className="h-40 w-auto object-cover"
                />
              </div>
            )}
          </div>

          {uploadProgress && (
            <p className="text-sm text-gray-500">
              Uploading {uploadProgress.current} of {uploadProgress.total}...
            </p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleSaveMedia}
              disabled={savingMedia || !mainCategoryId || (!editingMediaId && !hasSelectedMedia) || (requiresSubCategory && !subCategoryId)}
            >
              {savingMedia ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {editingMediaId
                    ? "Saving..."
                    : uploadProgress
                      ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...`
                      : "Uploading..."}
                </>
              ) : editingMediaId ? (
                "Update Media"
              ) : isBulkUpload ? (
                `Upload ${pendingFiles.length} Files`
              ) : (
                "Save Media"
              )}
            </Button>
            <Button variant="outline" onClick={resetMediaForm}>
              {editingMediaId ? "Cancel" : "Clear Form"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <Label htmlFor="content-search">Search Content</Label>
          <Input
            id="content-search"
            className="mt-2"
            placeholder="Search by title or category..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        {filteredMediaItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-gray-400">
            <ImageIcon className="mx-auto mb-2 h-10 w-10 opacity-30" />
            <p>{mediaItems.length === 0 ? "No media uploaded yet." : "No matching content found."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {filteredMediaItems.map((item) => (
              <div key={item.id} className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="h-40 w-full object-cover"
                    onError={(event) => {
                      (event.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="inline-block min-w-0 max-w-full truncate rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                    {item.mainCategoryName && item.subCategoryName
                      ? `${item.mainCategoryName} / ${item.subCategoryName}`
                      : item.categoryName || "Uncategorized"}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                      onClick={() => handleEditMedia(item)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:bg-red-50 hover:text-red-700"
                      onClick={() => handleDeleteMedia(item.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
