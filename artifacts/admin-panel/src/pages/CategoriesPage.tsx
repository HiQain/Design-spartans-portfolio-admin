import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND_NAME } from "@/lib/branding";
import { Trash2, Plus, Tag, FolderTree, Pencil, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Category {
  id: string;
  name: string;
  parentId?: string;
  parentName?: string;
  createdAt: any;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [mainCategoryName, setMainCategoryName] = useState("");
  const [subCategoryName, setSubCategoryName] = useState("");
  const [selectedParentId, setSelectedParentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingParentId, setEditingParentId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "categories"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Category));
      setCategories(data.sort((a, b) => a.name.localeCompare(b.name)));
    });
    return unsub;
  }, []);

  const mainCategories = categories.filter((cat) => !cat.parentId);
  const getSubCategories = (parentId: string) =>
    categories.filter((cat) => cat.parentId === parentId);
  const editingCategory = categories.find((category) => category.id === editingCategoryId);
  const isEditingSubCategory = Boolean(editingCategory?.parentId);

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

  const commitBatches = async (operations: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }>) => {
    for (let index = 0; index < operations.length; index += 450) {
      const batch = writeBatch(db);
      operations.slice(index, index + 450).forEach(({ ref, data }) => {
        batch.update(ref, data);
      });
      await batch.commit();
    }
  };

  const addMainCategory = async () => {
    if (!mainCategoryName.trim()) return;
    setLoading(true);
    try {
      await addDoc(collection(db, "categories"), {
        name: mainCategoryName.trim(),
        createdAt: serverTimestamp(),
      });
      setMainCategoryName("");
      toast({ title: "Main category added successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to add category. Please try again.", variant: "destructive" });
    }
    setLoading(false);
  };

  const addSubCategory = async () => {
    if (!selectedParentId || !subCategoryName.trim()) return;

    const parent = mainCategories.find((cat) => cat.id === selectedParentId);
    if (!parent) {
      toast({ title: "Error", description: "Please select a valid main category.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, "categories"), {
        name: subCategoryName.trim(),
        parentId: parent.id,
        parentName: parent.name,
        createdAt: serverTimestamp(),
      });
      setSubCategoryName("");
      toast({ title: "Subcategory added successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to add subcategory. Please try again.", variant: "destructive" });
    }
    setLoading(false);
  };

  const saveCategoryEdit = async () => {
    if (!editingCategory || !editingCategoryName.trim()) return;

    const nextName = editingCategoryName.trim();
    const nextParentId = editingCategory.parentId ? editingParentId : "";
    const nextParent = nextParentId
      ? mainCategories.find((category) => category.id === nextParentId)
      : undefined;

    if (editingCategory.parentId && !nextParent) {
      toast({ title: "Error", description: "Please select a valid main category.", variant: "destructive" });
      return;
    }

    setSavingEdit(true);

    try {
      await updateDoc(doc(db, "categories", editingCategory.id), {
        name: nextName,
        ...(editingCategory.parentId
          ? {
              parentId: nextParent?.id || "",
              parentName: nextParent?.name || "",
            }
          : {}),
        updatedAt: serverTimestamp(),
      });

      const operations: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [];

      if (!editingCategory.parentId) {
        const childSnapshot = await getDocs(query(collection(db, "categories"), where("parentId", "==", editingCategory.id)));
        childSnapshot.forEach((childDoc) => {
          operations.push({
            ref: doc(db, "categories", childDoc.id),
            data: {
              parentName: nextName,
              updatedAt: serverTimestamp(),
            },
          });
        });
      }

      const [projectsSnapshot, contentSnapshot] = await Promise.all([
        getDocs(collection(db, "projects")),
        getDocs(collection(db, "content")),
      ]);

      projectsSnapshot.forEach((projectDoc) => {
        const project = projectDoc.data();
        const updateData: Record<string, unknown> = {};

        if (!editingCategory.parentId && project.mainCategoryId === editingCategory.id) {
          updateData.mainCategoryName = nextName;
        }

        if (editingCategory.parentId && project.subCategoryId === editingCategory.id) {
          updateData.subCategoryName = nextName;
        }

        if (editingCategory.parentId && project.categoryId === editingCategory.id) {
          updateData.categoryName = nextName;
        }

        if (!editingCategory.parentId && !project.subCategoryId && project.categoryId === editingCategory.id) {
          updateData.categoryName = nextName;
        }

        if (editingCategory.parentId && nextParent && project.subCategoryId === editingCategory.id) {
          updateData.mainCategoryId = nextParent.id;
          updateData.mainCategoryName = nextParent.name;
        }

        if (Object.keys(updateData).length > 0) {
          updateData.updatedAt = serverTimestamp();
          operations.push({
            ref: doc(db, "projects", projectDoc.id),
            data: updateData,
          });
        }
      });

      contentSnapshot.forEach((contentDoc) => {
        const item = contentDoc.data();
        const updateData: Record<string, unknown> = {};

        if (!editingCategory.parentId && item.mainCategoryId === editingCategory.id) {
          updateData.mainCategoryName = nextName;
        }

        if (editingCategory.parentId && item.subCategoryId === editingCategory.id) {
          updateData.subCategoryName = nextName;
        }

        if (editingCategory.parentId && item.categoryId === editingCategory.id) {
          updateData.categoryName = nextName;
        }

        if (!editingCategory.parentId && !item.subCategoryId && item.categoryId === editingCategory.id) {
          updateData.categoryName = nextName;
        }

        if (editingCategory.parentId && nextParent && item.subCategoryId === editingCategory.id) {
          updateData.mainCategoryId = nextParent.id;
          updateData.mainCategoryName = nextParent.name;
        }

        if (Object.keys(updateData).length > 0) {
          updateData.updatedAt = serverTimestamp();
          operations.push({
            ref: doc(db, "content", contentDoc.id),
            data: updateData,
          });
        }
      });

      await commitBatches(operations);
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
      const childCategories = categories.filter((cat) => cat.parentId === id);

      if (childCategories.length > 0) {
        const batch = writeBatch(db);
        batch.delete(doc(db, "categories", id));
        childCategories.forEach((child) => {
          batch.delete(doc(db, "categories", child.id));
        });
        await batch.commit();
      } else {
        await deleteDoc(doc(db, "categories", id));
      }

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
            <Button onClick={addMainCategory} disabled={loading || !mainCategoryName.trim()}>
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
            <Button onClick={addSubCategory} disabled={loading || !selectedParentId || !subCategoryName.trim()}>
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

            return (
              <div
                key={cat.id}
                className="bg-white border border-gray-200 rounded-xl px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
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
                        className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm text-blue-700"
                      >
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
