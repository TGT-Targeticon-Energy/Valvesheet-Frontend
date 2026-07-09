import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";

export function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader showLogo={true} isMainHeader={true} />
      <div className="flex flex-1 overflow-hidden">
        {/* Main nav sidebar — hidden on mobile, shown on md+ */}
        <div className="hidden md:flex h-full sticky top-0">
          <AppSidebar />
        </div>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}