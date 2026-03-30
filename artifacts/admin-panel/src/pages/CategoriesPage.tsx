import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND_NAME } from "@/lib/branding";
import { Trash2, Plus, Tag, FolderTree } from "lucide-react";
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                    onClick={() => deleteCategory(cat.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
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
