import { useState, useRef, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCategories,
  useListProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useReorderProjects,
  getListProjectsQueryKey,
  type Project,
} from "@workspace/api-client-react";
import { uploadImage } from "@/lib/uploads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND_NAME } from "@/lib/branding";
import {
  Trash2,
  Plus,
  FolderOpen,
  ExternalLink,
  Upload,
  Link,
  ImageIcon,
  X,
  Loader2,
  Pencil,
  EyeOff,
  GripVertical,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ImageMode = "upload" | "url";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Failed to save project. Please try again.";
}

interface BulkProjectRow {
  id: string;
  file: File;
  preview: string;
  title: string;
  description: string;
  link: string;
}

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const { data: categoriesData } = useListCategories();
  const categories = categoriesData ?? [];
  // includeHidden: admins need to see (and un-hide) projects the daily link-check cron hid.
  const { data: projectsData } = useListProjects({ includeHidden: true });
  // Trust the server's order (sortOrder, then createdAt DESC) - it already reflects
  // any manual drag-reordering, and re-sorting here would just undo it.
  const projects = projectsData ?? [];

  const createProjectMutation = useCreateProject();
  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();
  const reorderProjectsMutation = useReorderProjects();

  const invalidateProjects = () =>
    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey({ includeHidden: true }) });

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
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deadLinkOnly, setDeadLinkOnly] = useState(false);
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);
  const [reorderingProjects, setReorderingProjects] = useState(false);

  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkMainCategoryId, setBulkMainCategoryId] = useState("");
  const [bulkSubCategoryId, setBulkSubCategoryId] = useState("");
  const [bulkRows, setBulkRows] = useState<BulkProjectRow[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const bulkFormCardRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  const mainCategories = categories.filter((cat) => !cat.parentId);
  const availableSubCategories = categories.filter((cat) => cat.parentId === mainCategoryId);
  const requiresSubCategory = mainCategoryId !== "" && availableSubCategories.length > 0;

  const bulkAvailableSubCategories = categories.filter((cat) => cat.parentId === bulkMainCategoryId);
  const bulkRequiresSubCategory = bulkMainCategoryId !== "" && bulkAvailableSubCategories.length > 0;

  const projectGroupKey = (proj: Project) => `${proj.mainCategoryId || proj.categoryId || ""}::${proj.subCategoryId || ""}`;

  const reorderProjectsInGroup = async (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;

    const draggedProject = projects.find((proj) => proj.id === draggedId);
    const targetProject = projects.find((proj) => proj.id === targetId);
    if (!draggedProject || !targetProject) return;

    if (projectGroupKey(draggedProject) !== projectGroupKey(targetProject)) {
      toast({
        title: "Can't reorder across categories",
        description: "Drag and drop only works between projects in the same category/subcategory.",
        variant: "destructive",
      });
      return;
    }

    const siblingProjects = projects.filter((proj) => projectGroupKey(proj) === projectGroupKey(draggedProject));
    const draggedIndex = siblingProjects.findIndex((proj) => proj.id === draggedId);
    if (draggedIndex === -1) return;

    const reordered = [...siblingProjects];
    const [movedProject] = reordered.splice(draggedIndex, 1);
    const targetIndex = reordered.findIndex((proj) => proj.id === targetId);
    reordered.splice(targetIndex === -1 ? reordered.length : targetIndex, 0, movedProject);

    setReorderingProjects(true);
    try {
      await reorderProjectsMutation.mutateAsync({
        data: {
          mainCategoryId: draggedProject.mainCategoryId || draggedProject.categoryId || undefined,
          subCategoryId: draggedProject.subCategoryId || undefined,
          orderedIds: reordered.map((proj) => proj.id),
        },
      });
      await invalidateProjects();
    } catch {
      toast({ title: "Error", description: "Failed to save project order.", variant: "destructive" });
    } finally {
      setReorderingProjects(false);
    }
  };

  const handleProjectDragStart = (id: string) => {
    setDraggingProjectId(id);
    setDragOverProjectId(id);
  };

  const handleProjectDragEnter = (id: string) => {
    if (draggingProjectId && draggingProjectId !== id) setDragOverProjectId(id);
  };

  const handleProjectDrop = async (id: string) => {
    if (!draggingProjectId) return;
    const draggedId = draggingProjectId;
    setDraggingProjectId(null);
    setDragOverProjectId(null);
    await reorderProjectsInGroup(draggedId, id);
  };

  const handleProjectDragEnd = () => {
    setDraggingProjectId(null);
    setDragOverProjectId(null);
  };

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

    if (requiresSubCategory && !subCategoryId) {
      toast({
        title: "Subcategory required",
        description: "Please select a subcategory for this main category.",
        variant: "destructive",
      });
      return;
    }

    if (imageMode === "upload" && !imageFile && !editingProjectId) {
      toast({
        title: "Image required",
        description: "Please select an image file or switch to Image URL.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    let finalImageUrl = imageMode === "url" ? imageUrl.trim() : "";

    try {
      if (imageMode === "upload" && imageFile) {
        setUploading(true);
        finalImageUrl = await uploadImage(imageFile);
        setUploading(false);
      }

      const mainCategory = categories.find((c) => c.id === mainCategoryId);
      const subCategory = categories.find((c) => c.id === subCategoryId);
      const selectedCategory = subCategory ?? mainCategory;

      const payload = {
        title: title.trim(),
        description: description.trim(),
        link: link.trim(),
        imageUrl: finalImageUrl || undefined,
        categoryId: selectedCategory?.id,
        categoryName: selectedCategory?.name,
        mainCategoryId: mainCategory?.id,
        mainCategoryName: mainCategory?.name,
        subCategoryId: subCategory?.id,
        subCategoryName: subCategory?.name,
      };

      if (editingProjectId) {
        await updateProjectMutation.mutateAsync({ id: editingProjectId, data: payload });
        toast({ title: "Project updated successfully." });
      } else {
        await createProjectMutation.mutateAsync({ data: payload });
        toast({ title: "Project added successfully." });
      }

      await invalidateProjects();
      resetForm();
    } catch (err) {
      toast({
        title: "Error",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  const deleteProject = async (id: string) => {
    try {
      await deleteProjectMutation.mutateAsync({ id });
      await invalidateProjects();
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

  const resetBulkForm = () => {
    bulkRows.forEach((row) => URL.revokeObjectURL(row.preview));
    setBulkRows([]);
    setBulkMainCategoryId("");
    setBulkSubCategoryId("");
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
    setShowBulkForm(false);
  };

  const handleBulkFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const newRows: BulkProjectRow[] = [];

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast({ title: "Invalid file", description: `${file.name} is not an image file.`, variant: "destructive" });
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: `${file.name} is over 5MB.`, variant: "destructive" });
        continue;
      }
      newRows.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
        title: "",
        description: "",
        link: "",
      });
    }

    setBulkRows((prev) => [...prev, ...newRows]);
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
  };

  const removeBulkRow = (id: string) => {
    setBulkRows((prev) => {
      const target = prev.find((row) => row.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((row) => row.id !== id);
    });
  };

  const updateBulkRow = (id: string, patch: Partial<Pick<BulkProjectRow, "title" | "description" | "link">>) => {
    setBulkRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addBulkProjects = async () => {
    if (bulkRows.length === 0) return;

    if (bulkRequiresSubCategory && !bulkSubCategoryId) {
      toast({
        title: "Subcategory required",
        description: "Please select a subcategory for this main category.",
        variant: "destructive",
      });
      return;
    }

    const incomplete = bulkRows.some((row) => !row.title.trim() || !row.link.trim());
    if (incomplete) {
      toast({
        title: "Missing fields",
        description: "Every project needs a title and a link.",
        variant: "destructive",
      });
      return;
    }

    setBulkSaving(true);
    setBulkProgress({ current: 0, total: bulkRows.length });

    const mainCategory = categories.find((c) => c.id === bulkMainCategoryId);
    const subCategory = categories.find((c) => c.id === bulkSubCategoryId);
    const selectedCategory = subCategory ?? mainCategory;

    let uploaded = 0;
    let failed = 0;

    for (const row of bulkRows) {
      try {
        const finalImageUrl = await uploadImage(row.file);
        await createProjectMutation.mutateAsync({
          data: {
            title: row.title.trim(),
            description: row.description.trim(),
            link: row.link.trim(),
            imageUrl: finalImageUrl,
            categoryId: selectedCategory?.id,
            categoryName: selectedCategory?.name,
            mainCategoryId: mainCategory?.id,
            mainCategoryName: mainCategory?.name,
            subCategoryId: subCategory?.id,
            subCategoryName: subCategory?.name,
          },
        });
        uploaded += 1;
      } catch {
        failed += 1;
      } finally {
        setBulkProgress((prev) => (prev ? { ...prev, current: prev.current + 1 } : prev));
      }
    }

    if (uploaded > 0) {
      await invalidateProjects();
      toast({
        title: `${uploaded} project${uploaded === 1 ? "" : "s"} added successfully.`,
        description: failed > 0 ? `${failed} project(s) failed to upload.` : undefined,
      });
    }

    if (failed > 0 && uploaded === 0) {
      toast({ title: "Error", description: "Failed to add projects.", variant: "destructive" });
    }

    setBulkSaving(false);
    setBulkProgress(null);
    resetBulkForm();
  };

  const renderProjectCard = (proj: Project) => (
    <div
      key={proj.id}
      onDragEnter={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        handleProjectDragEnter(proj.id);
      }}
      onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
      onDrop={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        void handleProjectDrop(proj.id);
      }}
      onDragEnd={handleProjectDragEnd}
      className={`flex flex-col bg-white border rounded-lg overflow-hidden transition-all ${
        proj.isHidden ? "border-amber-300" : "border-gray-200"
      } ${dragOverProjectId === proj.id && draggingProjectId !== proj.id ? "ring-2 ring-blue-400" : ""} ${
        draggingProjectId === proj.id ? "opacity-50" : ""
      }`}
    >
      <div className="relative">
        {proj.imageUrl && (
          <img
            src={proj.imageUrl}
            alt={proj.title}
            className="w-full h-40 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <button
          type="button"
          draggable={!reorderingProjects}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            handleProjectDragStart(proj.id);
          }}
          onDragEnd={handleProjectDragEnd}
          className="absolute left-1.5 top-1.5 rounded-md bg-black/50 p-1 text-white cursor-grab active:cursor-grabbing hover:bg-black/70"
          aria-label={`Drag ${proj.title}`}
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-2 p-3">
        <div className="min-w-0">
          <div className="flex flex-col items-start gap-1">
            <h3 className="w-full truncate font-semibold text-gray-900">{proj.title}</h3>
            <div className="flex flex-wrap gap-1">
              {proj.categoryName && (
                <span className="inline-block max-w-full truncate rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                  {proj.mainCategoryName && proj.subCategoryName
                    ? `${proj.mainCategoryName} / ${proj.subCategoryName}`
                    : proj.categoryName}
                </span>
              )}
              {proj.isHidden && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  <EyeOff className="w-3 h-3" />
                  Hidden — dead link
                </span>
              )}
            </div>
          </div>
          {proj.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{proj.description}</p>
          )}
          {proj.link && (
            <a
              href={proj.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2 truncate"
            >
              <ExternalLink className="w-3 h-3 shrink-0" />
              <span className="truncate">{proj.link}</span>
            </a>
          )}
        </div>
        <div className="flex justify-end gap-1">
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
  );

  const deadLinkCount = projects.filter((project) => project.isHidden).length;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => {
    if (deadLinkOnly && !project.isHidden) return false;
    if (filterCategoryId && (project.mainCategoryId || project.categoryId) !== filterCategoryId) return false;
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

  // Once a specific category is filtered, group results by subcategory - matches
  // how the public site sections them, and makes drag-reorder scope obvious.
  const filterSubCategories = filterCategoryId ? categories.filter((cat) => cat.parentId === filterCategoryId) : [];
  const projectGroups: { key: string; label: string; items: Project[] }[] =
    filterCategoryId && filterSubCategories.length > 0
      ? [
          ...filterSubCategories.map((sub) => ({
            key: sub.id,
            label: sub.name,
            items: filteredProjects.filter((proj) => proj.subCategoryId === sub.id),
          })),
          {
            key: "__ungrouped__",
            label: "No Subcategory",
            items: filteredProjects.filter((proj) => !proj.subCategoryId),
          },
        ].filter((group) => group.items.length > 0)
      : [{ key: "__all__", label: "", items: filteredProjects }];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">Manage portfolio projects published under {BRAND_NAME}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (showBulkForm) {
                resetBulkForm();
                return;
              }
              if (showForm) resetForm();
              setShowBulkForm(true);
            }}
          >
            <Upload className="w-4 h-4 mr-1" />
            {showBulkForm ? "Hide Bulk Upload" : "Bulk Upload"}
          </Button>
          <Button
            onClick={() => {
              if (showForm && editingProjectId) {
                resetForm();
                return;
              }
              if (showBulkForm) resetBulkForm();
              setShowForm(!showForm);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            {showForm ? (editingProjectId ? "Close Editor" : "Hide Form") : "New Project"}
          </Button>
        </div>
      </div>

      {showBulkForm && (
        <Card ref={bulkFormCardRef} className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-base">Bulk Add Projects</CardTitle>
            <p className="text-sm text-gray-500">
              Select multiple images to create one project per image, all under the same category. Each project keeps its own title, description, and link.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="bulk-main-cat">Main Category</Label>
              <select
                id="bulk-main-cat"
                value={bulkMainCategoryId}
                onChange={(e) => {
                  setBulkMainCategoryId(e.target.value);
                  setBulkSubCategoryId("");
                }}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">— Select a main category —</option>
                {mainCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {bulkMainCategoryId && bulkAvailableSubCategories.length > 0 && (
              <div>
                <Label htmlFor="bulk-sub-cat">Subcategory <span className="text-red-500">*</span></Label>
                <select
                  id="bulk-sub-cat"
                  value={bulkSubCategoryId}
                  onChange={(e) => setBulkSubCategoryId(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">— Select a subcategory —</option>
                  {bulkAvailableSubCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <Label>Project Images</Label>
              <input
                ref={bulkFileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleBulkFilesChange}
                className="hidden"
                id="bulk-image-upload"
              />
              <label
                htmlFor="bulk-image-upload"
                className="mt-2 flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-blue-400 hover:bg-blue-50"
              >
                <ImageIcon className="w-6 h-6 text-gray-300 mb-1" />
                <p className="text-sm text-gray-500">
                  {bulkRows.length > 0 ? `Add more images (${bulkRows.length} selected)` : "Click to select multiple images"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">PNG, JPG, GIF, WebP — max 5MB each</p>
              </label>
            </div>

            {bulkRows.length > 0 && (
              <div className="space-y-3">
                {bulkRows.map((row, index) => (
                  <div key={row.id} className="flex gap-3 rounded-lg border border-gray-200 p-3">
                    <img
                      src={row.preview}
                      alt={row.file.name}
                      className="h-24 w-24 shrink-0 rounded-md object-cover border border-gray-200"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <Input
                        placeholder={`Title for project ${index + 1}...`}
                        value={row.title}
                        onChange={(e) => updateBulkRow(row.id, { title: e.target.value })}
                      />
                      <Input
                        placeholder="https://..."
                        value={row.link}
                        onChange={(e) => updateBulkRow(row.id, { link: e.target.value })}
                      />
                      <Textarea
                        placeholder="Brief description..."
                        value={row.description}
                        onChange={(e) => updateBulkRow(row.id, { description: e.target.value })}
                        className="resize-none"
                        rows={2}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBulkRow(row.id)}
                      className="shrink-0 self-start text-gray-400 hover:text-red-500"
                      aria-label={`Remove ${row.file.name}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {bulkProgress && (
              <p className="text-sm text-gray-500">
                Uploading {bulkProgress.current} of {bulkProgress.total}...
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                onClick={addBulkProjects}
                disabled={
                  bulkSaving ||
                  bulkRows.length === 0 ||
                  (bulkRequiresSubCategory && !bulkSubCategoryId)
                }
              >
                {bulkSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {bulkProgress ? `Uploading ${bulkProgress.current}/${bulkProgress.total}...` : "Uploading..."}
                  </>
                ) : (
                  `Upload ${bulkRows.length || ""} Project${bulkRows.length === 1 ? "" : "s"}`
                )}
              </Button>
              <Button variant="outline" onClick={resetBulkForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card ref={formCardRef} className="max-w-2xl">
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
                <Label htmlFor="proj-sub-cat">Subcategory <span className="text-red-500">*</span></Label>
                <select
                  id="proj-sub-cat"
                  value={subCategoryId}
                  onChange={(e) => setSubCategoryId(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">— Select a subcategory —</option>
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
              <Button onClick={addProject} disabled={saving || uploading || !title.trim() || !link.trim() || (requiresSubCategory && !subCategoryId)}>
                {uploading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading image...</>
                ) : saving ? (
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
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setDeadLinkOnly((prev) => !prev)}
              className={`flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                deadLinkOnly
                  ? "bg-amber-50 border-amber-300 text-amber-800"
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              <EyeOff className="w-3.5 h-3.5" />
              Dead Links Only
              {deadLinkCount > 0 && (
                <span className={`ml-0.5 rounded-full px-1.5 text-xs ${deadLinkOnly ? "bg-amber-200 text-amber-900" : "bg-gray-100 text-gray-600"}`}>
                  {deadLinkCount}
                </span>
              )}
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="project-search">Search Projects</Label>
              <Input
                id="project-search"
                className="mt-2"
                placeholder="Search by title, link, description, or category..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <div className="sm:w-56">
              <Label htmlFor="project-filter-category">Filter by Category</Label>
              <select
                id="project-filter-category"
                value={filterCategoryId}
                onChange={(e) => setFilterCategoryId(e.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Categories</option>
                {mainCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>
              {projects.length === 0
                ? "No projects yet. Add your first one above."
                : deadLinkOnly
                ? "No dead link projects found."
                : "No matching projects found."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {projectGroups.map((group) => (
              <div key={group.key}>
                {group.label && (
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    {group.label}
                    <span className="ml-1.5 font-normal normal-case text-gray-400">({group.items.length})</span>
                  </h3>
                )}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                  {group.items.map((proj) => renderProjectCard(proj))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
