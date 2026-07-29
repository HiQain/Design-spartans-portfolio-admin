import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import DashboardPage from "@/pages/DashboardPage";
import CategoriesPage from "@/pages/CategoriesPage";
import ProjectsPage from "@/pages/ProjectsPage";
import ContentPage from "@/pages/ContentPage";
import TopContentPage from "@/pages/TopContentPage";
import LoginPage from "@/pages/LoginPage";
import { APP_TITLE, BRAND_LOGO_SRC, BRAND_NAME } from "@/lib/branding";
import {
  LayoutDashboard,
  Tag,
  FolderOpen,
  Menu,
  LogOut,
  Loader2,
  FileText,
  Newspaper,
} from "lucide-react";

type Page = "dashboard" | "categories" | "projects" | "content" | "top-content";

const navItems = [
  { id: "dashboard" as Page, label: "Dashboard", icon: LayoutDashboard },
  { id: "categories" as Page, label: "Categories", icon: Tag },
  { id: "projects" as Page, label: "Projects", icon: FolderOpen },
  { id: "content" as Page, label: "Content", icon: FileText },
  { id: "top-content" as Page, label: "Top Content", icon: Newspaper },
];

function App() {
  const { user, loading: authLoading, login, logout } = useAuth();
  const [page, setPage] = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.title = APP_TITLE;
  }, []);

  const handleSignOut = () => {
    logout();
    setPage("dashboard");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginPage onLogin={login} />
        <Toaster />
      </>
    );
  }

  const pageMap = {
    dashboard: <DashboardPage />,
    categories: <CategoriesPage />,
    projects: <ProjectsPage />,
    content: <ContentPage />,
    "top-content": <TopContentPage />,
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-60 bg-white border-r border-gray-200 z-30 flex flex-col transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:z-auto`}
      >
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <img
              src={BRAND_LOGO_SRC}
              alt={`${BRAND_NAME} logo`}
              className="h-11 w-11 rounded-xl object-cover ring-1 ring-gray-200"
            />
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-gray-900">{BRAND_NAME}</h2>
              <p className="text-xs text-gray-400 mt-0.5">Admin Panel</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setPage(id);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${page === id
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-100 space-y-3">
          <div className="px-2">
            <p className="text-xs font-medium text-gray-700 truncate">{user.email}</p>
            <p className="text-xs text-gray-400 mt-0.5">Connected</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-gray-600 hover:text-red-600 hover:bg-red-50"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <img
            src={BRAND_LOGO_SRC}
            alt={`${BRAND_NAME} logo`}
            className="h-9 w-9 rounded-lg object-cover ring-1 ring-gray-200"
          />
          <div className="min-w-0">
            <span className="block truncate font-semibold text-gray-900">{BRAND_NAME}</span>
            <span className="block text-xs text-gray-400">Admin Panel</span>
          </div>
        </header>

        <main className="flex-1 p-6 w-full">
          {pageMap[page]}
        </main>
      </div>

      <Toaster />
    </div>
  );
}

export default App;
