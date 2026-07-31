import { useRef, useState, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCategories,
  useListMedia,
  useCreateMedia,
  useUpdateMedia,
  useDeleteMedia,
  useReorderMedia,
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
import { GripVertical, ImageIcon, Loader2, Pencil, Trash2, Upload } from "lucide-react";

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
  // Trust the server's order (sortOrder, then createdAt DESC) - it already reflects
  // any manual drag-reordering, and re-sorting here would just undo it.
  const mediaItems = mediaPage?.items ?? [];

  const createMediaMutation = useCreateMedia();
  const updateMediaMutation = useUpdateMedia();
  const deleteMediaMutation = useDeleteMedia();
  const reorderMediaMutation = useReorderMedia();

  const invalidateMedia = () =>
    queryClient.invalidateQueries({ queryKey: getListMediaQueryKey({ limit: ADMIN_MEDIA_LIMIT }) });

  const [mediaTitle, setMediaTitle] = useState("");
  const [mainCategoryId, setMainCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [playStoreLink, setPlayStoreLink] = useState("");
  const [appStoreLink, setAppStoreLink] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [secondaryMediaFile, setSecondaryMediaFile] = useState<File | null>(null);
  const [secondaryMediaPreview, setSecondaryMediaPreview] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [savingMedia, setSavingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [editingMediaId, setEditingMediaId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const secondaryFileInputRef = useRef<HTMLInputElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);
  const [draggingMediaId, setDraggingMediaId] = useState<string | null>(null);
  const [dragOverMediaId, setDragOverMediaId] = useState<string | null>(null);
  const [reorderingMedia, setReorderingMedia] = useState(false);
  const { toast } = useToast();

  const mainCategories = categories.filter((category) => !category.parentId);
  const subCategories = categories.filter((category) => category.parentId === mainCategoryId);
  const requiresSubCategory = mainCategoryId !== "" && subCategories.length > 0;
  const selectedMainCategoryName = (
    mainCategories.find((category) => category.id === mainCategoryId)?.name || ""
  )
    .trim()
    .toLowerCase();
  const isMobileAppCategory = selectedMainCategoryName === "mobile app";
  // These categories get a front/back image pair instead of a single image - the public
  // site shows a rotating 3D flip card when both are present, or just the front if not.
  const isFlipCategory = selectedMainCategoryName === "merchandise & apparel" || selectedMainCategoryName === "branding materials";

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview("");
    pendingFiles.forEach((pending) => URL.revokeObjectURL(pending.preview));
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearSecondaryMedia = () => {
    setSecondaryMediaFile(null);
    setSecondaryMediaPreview("");
    if (secondaryFileInputRef.current) secondaryFileInputRef.current.value = "";
  };

  const mediaGroupKey = (item: Media) => `${item.mainCategoryId || item.categoryId || ""}::${item.subCategoryId || ""}`;

  const reorderMediaInGroup = async (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;

    const draggedItem = mediaItems.find((item) => item.id === draggedId);
    const targetItem = mediaItems.find((item) => item.id === targetId);
    if (!draggedItem || !targetItem) return;

    if (mediaGroupKey(draggedItem) !== mediaGroupKey(targetItem)) {
      toast({
        title: "Can't reorder across categories",
        description: "Drag and drop only works between items in the same category/subcategory.",
        variant: "destructive",
      });
      return;
    }

    const siblingItems = mediaItems.filter((item) => mediaGroupKey(item) === mediaGroupKey(draggedItem));
    const draggedIndex = siblingItems.findIndex((item) => item.id === draggedId);
    if (draggedIndex === -1) return;

    const reordered = [...siblingItems];
    const [movedItem] = reordered.splice(draggedIndex, 1);
    const targetIndex = reordered.findIndex((item) => item.id === targetId);
    reordered.splice(targetIndex === -1 ? reordered.length : targetIndex, 0, movedItem);

    setReorderingMedia(true);
    try {
      await reorderMediaMutation.mutateAsync({
        data: {
          mainCategoryId: draggedItem.mainCategoryId || draggedItem.categoryId || undefined,
          subCategoryId: draggedItem.subCategoryId || undefined,
          orderedIds: reordered.map((item) => item.id),
        },
      });
      await invalidateMedia();
    } catch {
      toast({ title: "Error", description: "Failed to save content order.", variant: "destructive" });
    } finally {
      setReorderingMedia(false);
    }
  };

  const handleMediaDragStart = (id: string) => {
    setDraggingMediaId(id);
    setDragOverMediaId(id);
  };

  const handleMediaDragEnter = (id: string) => {
    if (draggingMediaId && draggingMediaId !== id) setDragOverMediaId(id);
  };

  const handleMediaDrop = async (id: string) => {
    if (!draggingMediaId) return;
    const draggedId = draggingMediaId;
    setDraggingMediaId(null);
    setDragOverMediaId(null);
    await reorderMediaInGroup(draggedId, id);
  };

  const handleMediaDragEnd = () => {
    setDraggingMediaId(null);
    setDragOverMediaId(null);
  };

  const resetMediaForm = () => {
    setMediaTitle("");
    setMainCategoryId("");
    setSubCategoryId("");
    setPlayStoreLink("");
    setAppStoreLink("");
    setEditingMediaId(null);
    clearMedia();
    clearSecondaryMedia();
  };

  const handleSecondaryFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: `${file.name} is not an image file.`, variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: `${file.name} is over 5MB.`, variant: "destructive" });
      return;
    }

    setSecondaryMediaFile(file);
    setSecondaryMediaPreview(URL.createObjectURL(file));
    if (secondaryFileInputRef.current) secondaryFileInputRef.current.value = "";
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
      playStoreLink: isMobileAppCategory ? playStoreLink.trim() || null : null,
      appStoreLink: isMobileAppCategory ? appStoreLink.trim() || null : null,
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
        const secondaryImageUrl = isFlipCategory
          ? secondaryMediaFile
            ? await uploadImage(secondaryMediaFile)
            : secondaryMediaPreview || null
          : null;
        const payload = { ...basePayload, title: mediaTitle.trim(), imageUrl, secondaryImageUrl };

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
    setPlayStoreLink(item.playStoreLink || "");
    setAppStoreLink(item.appStoreLink || "");
    setMediaPreview(item.imageUrl || "");
    setMediaFile(null);
    setSecondaryMediaPreview(item.secondaryImageUrl || "");
    setSecondaryMediaFile(null);
    if (secondaryFileInputRef.current) secondaryFileInputRef.current.value = "";
    pendingFiles.forEach((pending) => URL.revokeObjectURL(pending.preview));
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredMediaItems = mediaItems.filter((item) => {
    if (filterCategoryId && item.mainCategoryId !== filterCategoryId && item.categoryId !== filterCategoryId) {
      return false;
    }

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

  // Once a specific category is filtered, group results by subcategory - matches
  // how the public site sections them, and makes drag-reorder scope obvious.
  const filterSubCategories = filterCategoryId ? categories.filter((c) => c.parentId === filterCategoryId) : [];
  const mediaGroups: { key: string; label: string; items: Media[] }[] =
    filterCategoryId && filterSubCategories.length > 0
      ? [
          ...filterSubCategories.map((sub) => ({
            key: sub.id,
            label: sub.name,
            items: filteredMediaItems.filter((item) => item.subCategoryId === sub.id),
          })),
          {
            key: "__ungrouped__",
            label: "No Subcategory",
            items: filteredMediaItems.filter((item) => !item.subCategoryId),
          },
        ].filter((group) => group.items.length > 0)
      : [{ key: "__all__", label: "", items: filteredMediaItems }];

  const renderMediaCard = (item: Media) => (
    <div
      key={item.id}
      onDragEnter={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        handleMediaDragEnter(item.id);
      }}
      onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
      onDrop={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        void handleMediaDrop(item.id);
      }}
      onDragEnd={handleMediaDragEnd}
      className={`flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:shadow-md ${
        dragOverMediaId === item.id && draggingMediaId !== item.id ? "ring-2 ring-blue-400" : ""
      } ${draggingMediaId === item.id ? "opacity-50" : ""}`}
    >
      <div className="relative">
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
        <button
          type="button"
          draggable={!reorderingMedia}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            handleMediaDragStart(item.id);
          }}
          onDragEnd={handleMediaDragEnd}
          className="absolute left-1.5 top-1.5 rounded-md bg-black/50 p-1 text-white cursor-grab active:cursor-grabbing hover:bg-black/70"
          aria-label={`Drag ${item.title || "media item"}`}
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </div>
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
  );

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
              {isFlipCategory
                ? "Upload a front image (required) and a back image (optional) - items with both show a rotating 3D flip card on the site."
                : "Select multiple images to bulk upload them all under the same category."}
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

          {isMobileAppCategory && (
            <>
              <div>
                <Label htmlFor="media-play-store-link">Play Store Link</Label>
                <Input
                  id="media-play-store-link"
                  placeholder="https://play.google.com/store/apps/details?id=..."
                  value={playStoreLink}
                  onChange={(event) => setPlayStoreLink(event.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="media-app-store-link">App Store Link</Label>
                <Input
                  id="media-app-store-link"
                  placeholder="https://apps.apple.com/app/..."
                  value={appStoreLink}
                  onChange={(event) => setAppStoreLink(event.target.value)}
                  className="mt-1"
                />
              </div>
            </>
          )}

          <div>
            <Label>
              {isFlipCategory
                ? (
                  <>
                    Front Image <span className="text-red-500">*</span>
                  </>
                )
                : editingMediaId
                  ? "Media File"
                  : "Media File(s)"}
            </Label>
            <input
              ref={fileInputRef}
              id="media-upload"
              type="file"
              accept="image/*"
              multiple={!editingMediaId && !isFlipCategory}
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
                  {editingMediaId || isFlipCategory
                    ? "Click to upload media"
                    : "Click to upload media (select multiple to bulk upload)"}
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

          {isFlipCategory && (
            <div>
              <Label>Back Image (optional)</Label>
              <input
                ref={secondaryFileInputRef}
                id="media-upload-secondary"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleSecondaryFileChange}
              />

              {!secondaryMediaPreview ? (
                <label
                  htmlFor="media-upload-secondary"
                  className="mt-2 flex h-36 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-blue-400 hover:bg-blue-50"
                >
                  <Upload className="mb-2 h-8 w-8 text-gray-300" />
                  <p className="text-sm text-gray-600">Click to upload back image (optional)</p>
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF, WebP up to 5MB</p>
                </label>
              ) : (
                <div className="relative mt-3 inline-block overflow-hidden rounded-xl border border-gray-200">
                  <img
                    src={secondaryMediaPreview}
                    alt="Selected back image preview"
                    className="h-40 w-auto object-cover"
                  />
                  <button
                    type="button"
                    onClick={clearSecondaryMedia}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-opacity hover:bg-black/80"
                    aria-label="Remove back image"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

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
        <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row">
          <div className="flex-1">
            <Label htmlFor="content-search">Search Content</Label>
            <Input
              id="content-search"
              className="mt-2"
              placeholder="Search by title or category..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <div className="sm:w-56">
            <Label htmlFor="content-category-filter">Filter by Category</Label>
            <select
              id="content-category-filter"
              value={filterCategoryId}
              onChange={(event) => setFilterCategoryId(event.target.value)}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {mainCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredMediaItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-gray-400">
            <ImageIcon className="mx-auto mb-2 h-10 w-10 opacity-30" />
            <p>{mediaItems.length === 0 ? "No media uploaded yet." : "No matching content found."}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {mediaGroups.map((group) => (
              <div key={group.key}>
                {group.label && (
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    {group.label}
                    <span className="ml-1.5 font-normal normal-case text-gray-400">({group.items.length})</span>
                  </h3>
                )}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                  {group.items.map((item) => renderMediaCard(item))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
