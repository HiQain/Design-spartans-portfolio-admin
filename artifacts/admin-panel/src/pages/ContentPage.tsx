import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { BRAND_NAME } from "@/lib/branding";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageIcon, Loader2, Pencil, Trash2, Upload } from "lucide-react";

interface Category {
  id: string;
  name: string;
  parentId?: string;
}

interface MediaItem {
  id: string;
  title: string;
  imageUrl: string;
  categoryId: string;
  categoryName: string;
  mainCategoryId?: string;
  mainCategoryName?: string;
  subCategoryId?: string;
  subCategoryName?: string;
  createdAt?: {
    seconds?: number;
  };
}

const MAX_EMBEDDED_IMAGE_BYTES = 700 * 1024;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Media file could not be read."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image preview could not be generated."));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Image compression failed."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

async function fileToEmbeddedImage(file: File) {
  const dataUrl = await readFileAsDataUrl(file);
  const sourceImage = await loadImage(dataUrl);
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(sourceImage.width, sourceImage.height));
  const canvas = document.createElement("canvas");

  canvas.width = Math.max(1, Math.round(sourceImage.width * scale));
  canvas.height = Math.max(1, Math.round(sourceImage.height * scale));

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Image processing is not supported in this browser.");
  }

  context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);

  let quality = 0.9;
  let blob = await canvasToBlob(canvas, quality);

  while (blob.size > MAX_EMBEDDED_IMAGE_BYTES && quality > 0.4) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
  }

  if (blob.size > MAX_EMBEDDED_IMAGE_BYTES) {
    throw new Error("Image is still too large after compression. Please use a smaller image.");
  }

  return await readFileAsDataUrl(new File([blob], `${file.name}.webp`, { type: "image/webp" }));
}

export default function ContentPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaTitle, setMediaTitle] = useState("");
  const [mainCategoryId, setMainCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [savingMedia, setSavingMedia] = useState(false);
  const [editingMediaId, setEditingMediaId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const unsubCategories = onSnapshot(collection(db, "categories"), (snap) => {
      setCategories(snap.docs.map((item) => ({ id: item.id, ...item.data() } as Category)));
    });

    const unsubMedia = onSnapshot(collection(db, "media"), (snap) => {
      const data = snap.docs.map((item) => ({ id: item.id, ...item.data() } as MediaItem));
      setMediaItems(data.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)));
    });

    return () => {
      unsubCategories();
      unsubMedia();
    };
  }, []);

  const mainCategories = categories.filter((category) => !category.parentId);
  const subCategories = categories.filter((category) => category.parentId === mainCategoryId);
  const requiresSubCategory = mainCategoryId !== "" && subCategories.length > 0;

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview("");
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
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Image must be under 5MB.",
        variant: "destructive",
      });
      return;
    }

    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleSaveMedia = async () => {
    if (!mainCategoryId || (!editingMediaId && !mediaFile)) {
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

    try {
      const imageUrl = mediaFile ? await fileToEmbeddedImage(mediaFile) : mediaPreview;
      const mainCategory = categories.find((category) => category.id === mainCategoryId);
      const subCategory = categories.find((category) => category.id === subCategoryId);
      const selectedCategory = subCategory ?? mainCategory;

      const payload = {
        title: mediaTitle.trim(),
        imageUrl,
        categoryId: selectedCategory?.id ?? "",
        categoryName: selectedCategory?.name ?? "",
        mainCategoryId: mainCategory?.id ?? "",
        mainCategoryName: mainCategory?.name ?? "",
        subCategoryId: subCategory?.id ?? "",
        subCategoryName: subCategory?.name ?? "",
      };

      if (editingMediaId) {
        await updateDoc(doc(db, "media", editingMediaId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        toast({ title: "Media updated successfully." });
      } else {
        await addDoc(collection(db, "media"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        toast({ title: "Media uploaded successfully." });
      }

      resetMediaForm();
    } catch (error) {
      toast({
        title: "Error",
        description: getErrorMessage(error, "Failed to upload media."),
        variant: "destructive",
      });
    } finally {
      setSavingMedia(false);
    }
  };

  const handleDeleteMedia = async (id: string) => {
    try {
      await deleteDoc(doc(db, "media", id));
      toast({ title: "Media deleted." });
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete media.",
        variant: "destructive",
      });
    }
  };

  const handleEditMedia = (item: MediaItem) => {
    setEditingMediaId(item.id);
    setMediaTitle(item.title ?? "");
    setMainCategoryId(item.mainCategoryId || item.categoryId || "");
    setSubCategoryId(item.subCategoryId || "");
    setMediaPreview(item.imageUrl || "");
    setMediaFile(null);
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

      <Card ref={formCardRef}>
        <CardHeader>
          <CardTitle className="text-base">
            {editingMediaId ? "Edit Media" : "Upload Media"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="media-title">Media Title</Label>
            <Input
              id="media-title"
              placeholder="Optional media title..."
              value={mediaTitle}
              onChange={(event) => setMediaTitle(event.target.value)}
              className="mt-1"
            />
          </div>

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
            <Label>Media File</Label>
            <input
              ref={fileInputRef}
              id="media-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {!mediaPreview ? (
              <label
                htmlFor="media-upload"
                className="mt-2 flex h-36 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-blue-400 hover:bg-blue-50"
              >
                <Upload className="mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-600">Click to upload media</p>
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

          <div className="flex gap-2">
            <Button
              onClick={handleSaveMedia}
              disabled={savingMedia || !mainCategoryId || (!editingMediaId && !mediaFile) || (requiresSubCategory && !subCategoryId)}
            >
              {savingMedia ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {editingMediaId ? "Saving..." : "Uploading..."}
                </>
              ) : (
                editingMediaId ? "Update Media" : "Save Media"
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
          filteredMediaItems.map((item) => (
            <div key={item.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="h-48 w-full object-cover"
                  onError={(event) => {
                    (event.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900">{item.title || "Untitled Media"}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {item.mainCategoryName && item.subCategoryName
                      ? `${item.mainCategoryName} / ${item.subCategoryName}`
                      : item.categoryName || "Uncategorized"}
                  </p>
                </div>
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
          ))
        )}
      </div>
    </div>
  );
}
