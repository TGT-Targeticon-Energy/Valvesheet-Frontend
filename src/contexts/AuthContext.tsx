/**
 * Authentication Context
 * Provides global authentication state and methods
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { authService, FPSORole, User } from "@/services/authService";
import { onUnauthorized } from "@/lib/authBus";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => void;
  hasPermission: (permission: string) => boolean;
  userRole: FPSORole | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const rolePermissionFallback: Record<string, Partial<FPSORole>> = {
  ENG_ADMIN: {
    can_create_ds: true,
    can_approve_ds: true,
    can_create_pr: true,
    can_approve_pr: true,
    can_view_cost: true,
    can_modify_user: true,
  },
  ADMIN: {
    can_create_ds: true,
    can_approve_ds: true,
    can_create_pr: true,
    can_approve_pr: true,
    can_view_cost: true,
    can_modify_user: true,
  },
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<FPSORole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Initialize auth state from localStorage
  useEffect(() => {
    const storedUser = authService.getCurrentUser();
    if (storedUser) {
      setUser(storedUser);
      void loadUserRole(storedUser);
    }
    setIsLoading(false);
  }, []);

  // Global 401/403 listener — silently log the user out and redirect
  // to /login. No toast, no message — just a clean redirect. Skips
  // the redirect if they're already on /login.
  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      authService.logout();
      setUser(null);
      setUserRole(null);
      if (location.pathname === "/login") return;
      navigate("/login", {
        replace: true,
        state: { from: location.pathname + location.search },
      });
    });
    return unsubscribe;
  }, [navigate, location.pathname, location.search]);

  const loadUserRole = async (currentUser: User) => {
    try {
      if (currentUser.role_code) {
        try {
          const roleDetails = await authService.getRoleByCode(currentUser.role_code);
          setUserRole(roleDetails);
          return;
        } catch {
          const fallback = rolePermissionFallback[currentUser.role_code] || {};
          setUserRole({
            role_code: currentUser.role_code,
            role_name: currentUser.role_code,
            can_create_ds: Boolean(fallback.can_create_ds),
            can_approve_ds: Boolean(fallback.can_approve_ds),
            can_create_pr: Boolean(fallback.can_create_pr),
            can_approve_pr: Boolean(fallback.can_approve_pr),
            can_view_cost: Boolean(fallback.can_view_cost),
            can_modify_user: Boolean(fallback.can_modify_user),
          });
          return;
        }
      }

      const roles = await authService.getUserRoles(currentUser.user_id);
      if (roles.length > 0) {
        const primaryRole = roles[0];
        const roleDetails = await authService.getRoleByCode(
          primaryRole.role_code
        );
        setUserRole(roleDetails);
        return;
      }
    } catch (error) {
      console.error("Failed to load user role:", error);
      if (currentUser.role_code) {
        const fallback = rolePermissionFallback[currentUser.role_code] || {};
        setUserRole({
          role_code: currentUser.role_code,
          role_name: currentUser.role_code,
          can_create_ds: Boolean(fallback.can_create_ds),
          can_approve_ds: Boolean(fallback.can_approve_ds),
          can_create_pr: Boolean(fallback.can_create_pr),
          can_approve_pr: Boolean(fallback.can_approve_pr),
          can_view_cost: Boolean(fallback.can_view_cost),
          can_modify_user: Boolean(fallback.can_modify_user),
        });
      }
    }
  };

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const loggedInUser = await authService.login(email, password);
      setUser(loggedInUser);
      await loadUserRole(loggedInUser);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setUserRole(null);
  };

  // Re-reads the (already-updated) localStorage user into context state —
  // call after authService.updateProfile() so the header/UI reflect edits
  // without a full page reload.
  const refreshUser = () => {
    const storedUser = authService.getCurrentUser();
    setUser(storedUser);
  };

  const hasPermission = (permission: string): boolean => {
    if (!userRole) return false;
    const permissionKey = permission as keyof FPSORole;
    return ((userRole[permissionKey] as any) === true) ? true : false;
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    refreshUser,
    hasPermission,
    userRole,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
