import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { BRAND_NAME } from "@/lib/branding";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, Loader2, Trash2, Upload, FileText } from "lucide-react";

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

interface TopContentDoc {
  content?: string;
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
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [savingMedia, setSavingMedia] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const unsubCategories = onSnapshot(collection(db, "categories"), (snap) => {
      setCategories(snap.docs.map((item) => ({ id: item.id, ...item.data() } as Category)));
    });

    const unsubMedia = onSnapshot(collection(db, "media"), (snap) => {
      const data = snap.docs.map((item) => ({ id: item.id, ...item.data() } as MediaItem));
      setMediaItems(data.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)));
    });

    const unsubTopContent = onSnapshot(doc(db, "topContent", "primary"), (snapshot) => {
      const data = snapshot.data() as TopContentDoc | undefined;
      const nextContent = data?.content ?? "";
      setSavedContent(nextContent);
      setContent((currentValue) => (currentValue ? currentValue : nextContent));
    });

    return () => {
      unsubCategories();
      unsubMedia();
      unsubTopContent();
    };
  }, []);

  const mainCategories = categories.filter((category) => !category.parentId);
  const subCategories = categories.filter((category) => category.parentId === mainCategoryId);

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
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
    if (!mediaTitle.trim() || !mainCategoryId || !mediaFile) {
      toast({
        title: "Missing fields",
        description: "Media title, category, and image are required.",
        variant: "destructive",
      });
      return;
    }

    setSavingMedia(true);

    try {
      const imageUrl = await fileToEmbeddedImage(mediaFile);
      const mainCategory = categories.find((category) => category.id === mainCategoryId);
      const subCategory = categories.find((category) => category.id === subCategoryId);
      const selectedCategory = subCategory ?? mainCategory;

      await addDoc(collection(db, "media"), {
        title: mediaTitle.trim(),
        imageUrl,
        categoryId: selectedCategory?.id ?? "",
        categoryName: selectedCategory?.name ?? "",
        mainCategoryId: mainCategory?.id ?? "",
        mainCategoryName: mainCategory?.name ?? "",
        subCategoryId: subCategory?.id ?? "",
        subCategoryName: subCategory?.name ?? "",
        createdAt: serverTimestamp(),
      });

      setMediaTitle("");
      setMainCategoryId("");
      setSubCategoryId("");
      clearMedia();
      toast({ title: "Media uploaded successfully." });
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

  const handleSaveContent = async () => {
    if (!content.trim()) {
      toast({
        title: "Content required",
        description: "Please add top content before saving.",
        variant: "destructive",
      });
      return;
    }

    setSavingContent(true);

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
      setSavingContent(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Content</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage uploaded media and top section content for {BRAND_NAME}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Media</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="media-title">Media Title</Label>
            <Input
              id="media-title"
              placeholder="Enter media title..."
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
              <Label htmlFor="media-sub-category">Subcategory</Label>
              <select
                id="media-sub-category"
                value={subCategoryId}
                onChange={(event) => setSubCategoryId(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Optional: select subcategory</option>
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
              disabled={savingMedia || !mediaTitle.trim() || !mainCategoryId || !mediaFile}
            >
              {savingMedia ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Save Media"
              )}
            </Button>
            <Button variant="outline" onClick={clearMedia}>
              Clear File
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {mediaItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-gray-400">
            <ImageIcon className="mx-auto mb-2 h-10 w-10 opacity-30" />
            <p>No media uploaded yet.</p>
          </div>
        ) : (
          mediaItems.map((item) => (
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
                  <h3 className="font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {item.mainCategoryName && item.subCategoryName
                      ? `${item.mainCategoryName} / ${item.subCategoryName}`
                      : item.categoryName || "Uncategorized"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                  onClick={() => handleDeleteMedia(item.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Content</CardTitle>
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
            <Button onClick={handleSaveContent} disabled={savingContent || !content.trim()}>
              {savingContent ? (
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
