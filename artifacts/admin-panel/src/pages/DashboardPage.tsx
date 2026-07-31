import { useGetStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND_LOGO_SRC, BRAND_NAME } from "@/lib/branding";
import { Tag, FolderOpen, LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  const { data: stats } = useGetStats();
  const catCount = stats?.categoriesCount ?? 0;
  const projCount = stats?.projectsCount ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of your {BRAND_NAME} portfolio content</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-[linear-gradient(135deg,_rgba(239,246,255,0.98),_rgba(255,255,255,0.95))] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <img
              src={BRAND_LOGO_SRC}
              alt={`${BRAND_NAME} logo`}
              className="h-16 w-16 rounded-2xl object-cover ring-1 ring-blue-100"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Brand Hub</p>
              <h2 className="text-xl font-semibold text-gray-900 mt-1">{BRAND_NAME}</h2>
              <p className="text-sm text-gray-600 mt-1">Keep categories and projects aligned with the latest brand portfolio.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Categories</CardTitle>
            <Tag className="w-5 h-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{catCount}</div>
            <p className="text-xs text-gray-400 mt-1">Registered categories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Projects</CardTitle>
            <FolderOpen className="w-5 h-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{projCount}</div>
            <p className="text-xs text-gray-400 mt-1">Registered projects</p>
          </CardContent>
        </Card>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-blue-700">
          <LayoutDashboard className="w-4 h-4" />
          <span className="text-sm font-medium">Getting Started</span>
        </div>
        <ul className="mt-2 text-sm text-blue-600 space-y-1 list-disc list-inside">
          <li>Start by adding categories to organize your work</li>
          <li>When adding a project, select a relevant category</li>
          <li>Make sure to include a project link for every entry</li>
        </ul>
      </div>
    </div>
  );
}
