import { Bell, Search, User, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { getRoleCode, isAdminRole } from "@/lib/roles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppHeaderProps {
  title?: string;
  breadcrumbs?: { label: string; href?: string }[];
  showLogo?: boolean;
  isMainHeader?: boolean;
}

export function AppHeader({ title, breadcrumbs, showLogo = true, isMainHeader = false }: AppHeaderProps) {
  const { user, logout, userRole } = useAuth();
  const navigate = useNavigate();
  const roleCode = getRoleCode(userRole, user as { role_code?: string } | null);

  if (!user) return null;
  if (!isMainHeader) return null;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleAdmin = () => {
    navigate("/admin");
  };

  const handleProfile = () => {
    navigate("/profile");
  };

  return (
    <header className="flex items-center justify-between h-14 sm:h-16 px-3 sm:px-6 border-b border-gray-200 bg-white z-10">
      {/* Left Section - Logo */}
      {showLogo && (
        <div className="flex items-center">
          <img
            src="/targeticon-logo.png"
            alt="Targeticon"
            className="h-8 sm:h-10 object-contain"
          />
        </div>
      )}

      {/* Right Section - Actions */}
      <div className="flex items-center gap-2 sm:gap-4 ml-auto">
        {/* Search */}
        {/* <Button variant="ghost" size="icon" className="h-9 w-9">
          <Search className="w-4 h-4 text-gray-500" />
        </Button> */}

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="h-9 w-9 relative">
          <Bell className="w-4 h-4 text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full" />
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 h-9 pl-2 pr-3">
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                <User className="w-4 h-4 text-gray-500" />
              </div>
              <span className="text-sm font-medium text-gray-700 hidden sm:inline">
                {user.first_name} {user.last_name}
              </span>
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-2">
                <p className="text-sm font-semibold">{user.first_name} {user.last_name}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
                <div className="text-xs text-gray-600 space-y-1">
                  <p><span className="font-medium">Employee ID:</span> {user.user_id}</p>
                  <p><span className="font-medium">Designation:</span> {user.designation}</p>
                  <p><span className="font-medium">Department:</span> {user.department}</p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleProfile}>
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
