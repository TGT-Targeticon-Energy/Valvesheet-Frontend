import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Lock,
  Briefcase,
  CheckCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAccessLevel,
  isAccessAdmin,
  canGenerateByAccess,
} from "@/lib/roles";

// Sidebar visibility is driven by the user's ACCESS LEVEL, not role_code.
// Access Level is set in the user-create dialog (Admin / Reviewer / Creator
// / Viewer) and is the primary RBAC driver. Role code remains as job-title
// metadata. The same access checks are applied in App.tsx for route guards
// so a Creator can't bypass the menu by typing a URL directly.

const getNavItems = (userRole?: any, user?: any) => {
  const access = getAccessLevel(user, userRole);
  const isAdmin = isAccessAdmin(access);
  const canGenerate = canGenerateByAccess(access);

  // Sidebar after the unified-workflow cleanup:
  //   • Dashboard — KPIs from the new VSW system
  //   • Generate Valvesheet — single source of truth (revision + signatures)
  //   • Valve AI Agent — Creator/Admin only; feeds into VSW via "Save to Workflow"
  //   • Generate PMS / PMS AI Agent — unchanged
  //   • Project Master / User Management — admin only
  //
  // Removed: Revision Workflow, Generate Datasheet, Approval Requests,
  // Generated Valvesheets. Each of those is now folded into the
  // Generate Valvesheet page.
  const items: { title: string; href: string; icon: any }[] = [
    { title: "Dashboard", href: "/", icon: LayoutDashboard },
    { title: "Generate Valvesheet", href: "/valvesheet-workflow", icon: CheckCircle },
  ];

  if (canGenerate) {
    items.push({ title: "Valve AI Agent", href: "/agent", icon: Sparkles });
  }

  if (canGenerate) {
    items.push({ title: "Generate PMS", href: "/PMS_generator", icon: FileSpreadsheet });
    items.push({ title: "PMS AI Agent", href: "/pms-agent", icon: Sparkles });
  }

  // PMS revision workflow — list / create / detail with the same
  // signature flow as Generate Valvesheet. Visible to all access levels
  // that can view valvesheets (Admin / Reviewer / Creator).
  items.push({
    title: "PMS Revision",
    href: "/pms-workflow",
    icon: CheckCircle,
  });

  if (isAdmin) {
    items.push({ title: "Project Master", href: "/projects", icon: Briefcase });
    items.push({ title: "User Management", href: "/admin", icon: Lock });
  }

  return items;
};

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { userRole, user } = useAuth();
  const navItems = getNavItems(userRole, user);

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <li key={item.href}>
                <NavLink
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-5 h-5 flex-shrink-0",
                      isActive && "text-sidebar-primary",
                    )}
                  />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Settings & Collapse */}
      <div className="border-t border-sidebar-border p-2">
        {/* <NavLink
          to="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all",
            location.pathname === "/settings"
              ? "bg-sidebar-accent text-sidebar-primary"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink> */}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full mt-2 py-2 rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span className="ml-2 text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
