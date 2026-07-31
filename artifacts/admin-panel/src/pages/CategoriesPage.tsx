import { useState, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useReorderCategories,
  getListCategoriesQueryKey,
  type Category,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND_NAME } from "@/lib/branding";
import { Trash2, Plus, Tag, FolderTree, Pencil, Loader2, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const { data: categoriesData } = useListCategories();
  const categories = categoriesData ?? [];

  const createCategoryMutation = useCreateCategory();
  const updateCategoryMutation = useUpdateCategory();
  const deleteCategoryMutation = useDeleteCategory();
  const reorderCategoriesMutation = useReorderCategories();

  const invalidateCategories = () =>
    queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });

  const [mainCategoryName, setMainCategoryName] = useState("");
  const [subCategoryName, setSubCategoryName] = useState("");
  const [selectedParentId, setSelectedParentId] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingParentId, setEditingParentId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | null>(null);
  const [reordering, setReordering] = useState(false);
  const { toast } = useToast();

  const mainCategories = categories.filter((cat) => !cat.parentId);
  const getSubCategories = (parentId: string) =>
    categories.filter((cat) => cat.parentId === parentId);
  const editingCategory = categories.find((category) => category.id === editingCategoryId);
  const isEditingSubCategory = Boolean(editingCategory?.parentId);

  const reorderCategories = async (draggedId: string, targetId: string, insertAfter = false) => {
    if (draggedId === targetId) {
      return;
    }

    const draggedCategory = categories.find((category) => category.id === draggedId);
    const targetCategory = categories.find((category) => category.id === targetId);

    if (!draggedCategory || !targetCategory) {
      return;
    }

    const draggedParentId = draggedCategory.parentId || null;
    const targetParentId = targetCategory.parentId || null;

    if ((draggedParentId || "") !== (targetParentId || "")) {
      return;
    }

    const siblingCategories = categories
      .filter((category) => (category.parentId || "") === (draggedParentId || ""))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const draggedIndex = siblingCategories.findIndex((category) => category.id === draggedId);
    if (draggedIndex === -1) {
      return;
    }

    const reordered = [...siblingCategories];
    const [movedCategory] = reordered.splice(draggedIndex, 1);
    const adjustedTargetIndex = reordered.findIndex((category) => category.id === targetId);
    const insertionIndex = adjustedTargetIndex === -1
      ? reordered.length
      : adjustedTargetIndex + (insertAfter ? 1 : 0);
    reordered.splice(insertionIndex, 0, movedCategory);

    setReordering(true);

    try {
      await reorderCategoriesMutation.mutateAsync({
        data: { parentId: draggedParentId, orderedIds: reordered.map((category) => category.id) },
      });
      await invalidateCategories();
      toast({ title: "Category order updated." });
    } catch {
      toast({
        title: "Error",
        description: "Failed to save category order.",
        variant: "destructive",
      });
    } finally {
      setReordering(false);
    }
  };

  const handleDragStart = (categoryId: string) => {
    setDraggingCategoryId(categoryId);
    setDragOverCategoryId(categoryId);
    setDragOverPosition(null);
  };

  const handleDragEnter = (categoryId: string, position: "before" | "after" = "before") => {
    if (draggingCategoryId && draggingCategoryId !== categoryId) {
      setDragOverCategoryId(categoryId);
      setDragOverPosition(position);
    }
  };

  const handleDrop = async (categoryId: string, position: "before" | "after" = "before") => {
    if (!draggingCategoryId) {
      return;
    }

    setDragOverCategoryId(categoryId);
    setDragOverPosition(position);
    await reorderCategories(draggingCategoryId, categoryId, position === "after");
    setDraggingCategoryId(null);
    setDragOverCategoryId(null);
    setDragOverPosition(null);
  };

  const handleDragEnd = () => {
    setDraggingCategoryId(null);
    setDragOverCategoryId(null);
    setDragOverPosition(null);
  };

  const resetEditForm = () => {
    setEditingCategoryId(null);
    setEditingCategoryName("");
    setEditingParentId("");
  };

  const startEditingCategory = (category: Category) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
    setEditingParentId(category.parentId || "");
  };

  const addMainCategory = async () => {
    if (!mainCategoryName.trim()) return;
    try {
      await createCategoryMutation.mutateAsync({ data: { name: mainCategoryName.trim() } });
      await invalidateCategories();
      setMainCategoryName("");
      toast({ title: "Main category added successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to add category. Please try again.", variant: "destructive" });
    }
  };

  const addSubCategory = async () => {
    if (!selectedParentId || !subCategoryName.trim()) return;

    const parent = mainCategories.find((cat) => cat.id === selectedParentId);
    if (!parent) {
      toast({ title: "Error", description: "Please select a valid main category.", variant: "destructive" });
      return;
    }

    try {
      await createCategoryMutation.mutateAsync({
        data: { name: subCategoryName.trim(), parentId: parent.id },
      });
      await invalidateCategories();
      setSubCategoryName("");
      toast({ title: "Subcategory added successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to add subcategory. Please try again.", variant: "destructive" });
    }
  };

  const saveCategoryEdit = async () => {
    if (!editingCategory || !editingCategoryName.trim()) return;

    const nextName = editingCategoryName.trim();
    const nextParent = editingCategory.parentId
      ? mainCategories.find((category) => category.id === editingParentId)
      : undefined;

    if (editingCategory.parentId && !nextParent) {
      toast({ title: "Error", description: "Please select a valid main category.", variant: "destructive" });
      return;
    }

    setSavingEdit(true);

    try {
      // Renaming/reparenting a category propagates to child categories and every
      // referencing project/media row server-side - no client-side cascade needed.
      await updateCategoryMutation.mutateAsync({
        id: editingCategory.id,
        data: {
          name: nextName,
          ...(editingCategory.parentId ? { parentId: nextParent!.id } : {}),
        },
      });
      await invalidateCategories();
      resetEditForm();
      toast({ title: "Category updated successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to update category.", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      // Deletes the category's direct children too, server-side.
      await deleteCategoryMutation.mutateAsync({ id });
      await invalidateCategories();
      toast({ title: "Category deleted." });
    } catch {
      toast({ title: "Error", description: "Failed to delete category.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
        <p className="text-sm text-gray-500 mt-1">Manage the category structure used across {BRAND_NAME} projects</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Main Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="cat-name" className="sr-only">Main Category Name</Label>
              <Input
                id="cat-name"
                placeholder="Enter main category name..."
                value={mainCategoryName}
                onChange={(e) => setMainCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMainCategory()}
              />
            </div>
            <Button onClick={addMainCategory} disabled={createCategoryMutation.isPending || !mainCategoryName.trim()}>
              <Plus className="w-4 h-4 mr-1" />
              Add Main
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Subcategory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="parent-category">Main Category</Label>
            <select
              id="parent-category"
              value={selectedParentId}
              onChange={(e) => setSelectedParentId(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select main category</option>
              {mainCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="sub-cat-name" className="sr-only">Subcategory Name</Label>
              <Input
                id="sub-cat-name"
                placeholder="Enter subcategory name..."
                value={subCategoryName}
                onChange={(e) => setSubCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSubCategory()}
              />
            </div>
            <Button onClick={addSubCategory} disabled={createCategoryMutation.isPending || !selectedParentId || !subCategoryName.trim()}>
              <Plus className="w-4 h-4 mr-1" />
              Add Sub
            </Button>
          </div>
        </CardContent>
      </Card>

      {editingCategory && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isEditingSubCategory ? "Edit Subcategory" : "Edit Main Category"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditingSubCategory && (
              <div>
                <Label htmlFor="edit-parent-category">Main Category</Label>
                <select
                  id="edit-parent-category"
                  value={editingParentId}
                  onChange={(event) => setEditingParentId(event.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Select main category</option>
                  {mainCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <Label htmlFor="edit-category-name">Category Name</Label>
              <Input
                id="edit-category-name"
                value={editingCategoryName}
                onChange={(event) => setEditingCategoryName(event.target.value)}
                placeholder="Enter category name..."
                className="mt-1"
                onKeyDown={(event) => event.key === "Enter" && saveCategoryEdit()}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={saveCategoryEdit}
                disabled={savingEdit || !editingCategoryName.trim() || (isEditingSubCategory && !editingParentId)}
              >
                {savingEdit ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
              <Button variant="outline" onClick={resetEditForm} disabled={savingEdit}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {categories.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Tag className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No categories yet. Add your first one above.</p>
          </div>
        ) : (
          mainCategories.map((cat) => {
            const subCategories = getSubCategories(cat.id);
            const isDragTarget = dragOverCategoryId === cat.id && draggingCategoryId !== cat.id;
            const showMoveAbove = isDragTarget && dragOverPosition === "before";
            const showMoveBelow = isDragTarget && dragOverPosition === "after";

            return (
              <div
                key={cat.id}
                onDragEnter={(event) => {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  handleDragEnter(cat.id, position);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  handleDragEnter(cat.id, position);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  void handleDrop(cat.id, position);
                }}
                onDragEnd={handleDragEnd}
                className={`relative bg-white border rounded-xl px-4 py-4 transition-all
                  ${isDragTarget ? "border-blue-400 bg-blue-50/60 shadow-[0_0_0_3px_rgba(59,130,246,0.08)]" : "border-gray-200"}
                  ${draggingCategoryId === cat.id ? "opacity-55 scale-[0.995]" : ""}`}
              >
                {showMoveAbove && (
                  <div className="absolute inset-x-4 -top-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
                    <div className="h-0.5 flex-1 rounded-full bg-blue-500" />
                    <span className="rounded-full bg-white/95 px-2 py-1 shadow-sm ring-1 ring-blue-200">Move Above</span>
                    <div className="h-0.5 flex-1 rounded-full bg-blue-500" />
                  </div>
                )}

                {showMoveBelow && (
                  <div className="absolute inset-x-4 -bottom-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
                    <div className="h-0.5 flex-1 rounded-full bg-blue-500" />
                    <span className="rounded-full bg-white/95 px-2 py-1 shadow-sm ring-1 ring-blue-200">Move Below</span>
                    <div className="h-0.5 flex-1 rounded-full bg-blue-500" />
                  </div>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        draggable={!reordering}
                        onDragStart={(event) => {
                          event.stopPropagation();
                          event.dataTransfer.effectAllowed = "move";
                          handleDragStart(cat.id);
                        }}
                        onDragEnd={(event) => {
                          event.stopPropagation();
                          handleDragEnd();
                        }}
                        className="rounded-md border border-gray-200 bg-gray-50 p-1.5 text-gray-400 cursor-grab active:cursor-grabbing hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                        aria-label={`Drag ${cat.name}`}
                        title="Drag to reorder"
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                      <FolderTree className="w-4 h-4 text-blue-500" />
                      <span className="font-semibold text-gray-900">{cat.name}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {subCategories.length > 0
                        ? `${subCategories.length} subcategories linked`
                        : "No subcategories yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      onClick={() => startEditingCategory(cat)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => deleteCategory(cat.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {subCategories.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {subCategories.map((subCategory) => (
                      <div
                        key={subCategory.id}
                        onDragEnter={(event: DragEvent<HTMLDivElement>) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleDragEnter(subCategory.id, "before");
                        }}
                        onDragOver={(event: DragEvent<HTMLDivElement>) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onDrop={(event: DragEvent<HTMLDivElement>) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleDrop(subCategory.id, "before");
                        }}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition
                          ${dragOverCategoryId === subCategory.id && draggingCategoryId !== subCategory.id
                            ? "border-blue-400 bg-blue-100 text-blue-700 shadow-sm"
                            : "border-blue-200 bg-blue-50 text-blue-700"}
                          ${draggingCategoryId === subCategory.id ? "opacity-60" : ""}`}
                      >
                        <button
                          type="button"
                          draggable={!reordering}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            event.dataTransfer.effectAllowed = "move";
                            handleDragStart(subCategory.id);
                          }}
                          onDragEnd={(event) => {
                            event.stopPropagation();
                            handleDragEnd();
                          }}
                          className="rounded-full text-blue-400 cursor-grab active:cursor-grabbing hover:text-blue-600"
                          aria-label={`Drag ${subCategory.name}`}
                          title="Drag to reorder"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </button>
                        <Tag className="w-3.5 h-3.5" />
                        <span>{subCategory.name}</span>
                        <button
                          type="button"
                          onClick={() => startEditingCategory(subCategory)}
                          className="rounded-full text-blue-500 hover:text-blue-700"
                          aria-label={`Edit ${subCategory.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(subCategory.id)}
                          className="rounded-full text-blue-500 hover:text-red-600"
                          aria-label={`Delete ${subCategory.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
