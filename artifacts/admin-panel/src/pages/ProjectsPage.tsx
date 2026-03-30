import { useState, useEffect, useRef } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND_NAME } from "@/lib/branding";
import { Trash2, Plus, FolderOpen, ExternalLink, Upload, Link, ImageIcon, X, Loader2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Category {
  id: string;
  name: string;
  parentId?: string;
  parentName?: string;
}

interface Project {
  id: string;
  title: string;
  description: string;
  link: string;
  imageUrl: string;
  categoryId: string;
  categoryName: string;
  mainCategoryId?: string;
  mainCategoryName?: string;
  subCategoryId?: string;
  subCategoryName?: string;
  createdAt: any;
}

type ImageMode = "upload" | "url";
const MAX_EMBEDDED_IMAGE_BYTES = 700 * 1024;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Failed to add project. Please try again.";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Image file could not be read."));
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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [mainCategoryId, setMainCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [imageMode, setImageMode] = useState<ImageMode>("upload");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const unsubProjects = onSnapshot(collection(db, "projects"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
      setProjects(data.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds));
    });
    const unsubCats = onSnapshot(collection(db, "categories"), (snap) => {
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Category)));
    });
    return () => { unsubProjects(); unsubCats(); };
  }, []);

  const mainCategories = categories.filter((cat) => !cat.parentId);
  const availableSubCategories = categories.filter((cat) => cat.parentId === mainCategoryId);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Image must be under 5MB.", variant: "destructive" });
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview("");
    setImageUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetForm = () => {
    setTitle(""); setDescription(""); setLink(""); setMainCategoryId(""); setSubCategoryId("");
    setEditingProjectId(null);
    setImageMode("upload");
    clearImage();
    setShowForm(false);
  };

  const addProject = async () => {
    if (!title.trim() || !link.trim()) return;

    if (imageMode === "upload" && !imageFile) {
      toast({
        title: "Image required",
        description: "Please select an image file or switch to Image URL.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    let finalImageUrl = "";

    try {
      if (imageMode === "upload" && imageFile) {
        setUploading(true);
        finalImageUrl = await fileToEmbeddedImage(imageFile);
      } else if (imageMode === "url" && imageUrl.trim()) {
        finalImageUrl = imageUrl.trim();
      }

      const mainCategory = categories.find((c) => c.id === mainCategoryId);
      const subCategory = categories.find((c) => c.id === subCategoryId);
      const selectedCategory = subCategory ?? mainCategory;

      const payload = {
        title: title.trim(),
        description: description.trim(),
        link: link.trim(),
        imageUrl: finalImageUrl,
        categoryId: selectedCategory?.id || "",
        categoryName: selectedCategory?.name || "",
        mainCategoryId: mainCategory?.id || "",
        mainCategoryName: mainCategory?.name || "",
        subCategoryId: subCategory?.id || "",
        subCategoryName: subCategory?.name || "",
      };

      if (editingProjectId) {
        await updateDoc(doc(db, "projects", editingProjectId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        toast({ title: "Project updated successfully." });
      } else {
        await addDoc(collection(db, "projects"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        toast({ title: "Project added successfully." });
      }

      resetForm();
    } catch (err) {
      toast({
        title: "Error",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setLoading(false);
    }
  };

  const deleteProject = async (id: string) => {
    try {
      await deleteDoc(doc(db, "projects", id));
      toast({ title: "Project deleted." });
    } catch {
      toast({ title: "Error", description: "Failed to delete project.", variant: "destructive" });
    }
  };

  const editProject = (project: Project) => {
    setEditingProjectId(project.id);
    setTitle(project.title || "");
    setDescription(project.description || "");
    setLink(project.link || "");
    setMainCategoryId(project.mainCategoryId || project.categoryId || "");
    setSubCategoryId(project.subCategoryId || "");
    setImageFile(null);
    setImageUrl(project.imageUrl || "");
    setImagePreview(project.imageUrl || "");
    setImageMode("url");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowForm(true);
    requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => {
    if (!normalizedQuery) return true;

    return [
      project.title,
      project.description,
      project.link,
      project.categoryName,
      project.mainCategoryName,
      project.subCategoryName,
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedQuery));
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">Manage portfolio projects published under {BRAND_NAME}</p>
        </div>
        <Button
          onClick={() => {
            if (showForm && editingProjectId) {
              resetForm();
              return;
            }
            setShowForm(!showForm);
          }}
        >
          <Plus className="w-4 h-4 mr-1" />
          {showForm ? (editingProjectId ? "Close Editor" : "Hide Form") : "New Project"}
        </Button>
      </div>

      {showForm && (
        <Card ref={formCardRef}>
          <CardHeader>
            <CardTitle className="text-base">
              {editingProjectId ? "Edit Project" : "Project Details"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="proj-title">Title <span className="text-red-500">*</span></Label>
              <Input
                id="proj-title"
                placeholder="Enter project title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="proj-desc">Description</Label>
              <Textarea
                id="proj-desc"
                placeholder="Brief description of the project..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 resize-none"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="proj-link">Project Link <span className="text-red-500">*</span></Label>
              <Input
                id="proj-link"
                placeholder="https://..."
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="proj-main-cat">Main Category</Label>
              <select
                id="proj-main-cat"
                value={mainCategoryId}
                onChange={(e) => {
                  setMainCategoryId(e.target.value);
                  setSubCategoryId("");
                }}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">— Select a main category —</option>
                {mainCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {mainCategoryId && availableSubCategories.length > 0 && (
              <div>
                <Label htmlFor="proj-sub-cat">Subcategory</Label>
                <select
                  id="proj-sub-cat"
                  value={subCategoryId}
                  onChange={(e) => setSubCategoryId(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">— Optional: select a subcategory —</option>
                  {availableSubCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <Label>Project Image</Label>
              <div className="mt-2 flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => { setImageMode("upload"); clearImage(); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors
                    ${imageMode === "upload"
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => { setImageMode("url"); clearImage(); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors
                    ${imageMode === "url"
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                >
                  <Link className="w-3.5 h-3.5" />
                  Image URL
                </button>
              </div>

              {imageMode === "upload" ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="image-upload"
                  />
                  {!imagePreview ? (
                    <label
                      htmlFor="image-upload"
                      className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    >
                      <ImageIcon className="w-8 h-8 text-gray-300 mb-2" />
                      <p className="text-sm text-gray-500">Click to upload an image</p>
                      <p className="text-xs text-gray-400 mt-0.5">PNG, JPG, GIF, WebP — max 5MB</p>
                    </label>
                  ) : (
                    <div className="relative inline-block">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="h-32 w-auto rounded-lg border border-gray-200 object-cover"
                      />
                      <button
                        type="button"
                        onClick={clearImage}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <Input
                    placeholder="https://example.com/image.jpg"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                  {imageUrl && (
                    <div className="relative inline-block mt-2">
                      <img
                        src={imageUrl}
                        alt="Preview"
                        className="h-32 w-auto rounded-lg border border-gray-200 object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={addProject} disabled={loading || uploading || !title.trim() || !link.trim()}>
                {uploading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing image...</>
                ) : loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                ) : editingProjectId ? "Update Project" : "Save Project"}
              </Button>
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <Label htmlFor="project-search">Search Projects</Label>
          <Input
            id="project-search"
            className="mt-2"
            placeholder="Search by title, link, description, or category..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        {filteredProjects.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>{projects.length === 0 ? "No projects yet. Add your first one above." : "No matching projects found."}</p>
          </div>
        ) : (
          filteredProjects.map((proj) => (
            <div key={proj.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {proj.imageUrl && (
                <img
                  src={proj.imageUrl}
                  alt={proj.title}
                  className="w-full h-44 object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{proj.title}</h3>
                      {proj.categoryName && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          {proj.mainCategoryName && proj.subCategoryName
                            ? `${proj.mainCategoryName} / ${proj.subCategoryName}`
                            : proj.categoryName}
                        </span>
                      )}
                    </div>
                    {proj.description && (
                      <p className="text-sm text-gray-500 mt-1">{proj.description}</p>
                    )}
                    <a
                      href={proj.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {proj.link}
                    </a>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 shrink-0"
                    onClick={() => editProject(proj)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                    onClick={() => deleteProject(proj.id)}
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
