/**
 * Protected Route Component
 * Wrapper for routes that require authentication and authorization
 */

import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getAccessLevel, AccessLevel } from "@/lib/roles";
import React from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
  requiredRole?: string | string[];
  /** Restrict by user access_level (Admin / Reviewer / Creator / Viewer).
   *  Pass an array of allowed access levels — the user's level must match. */
  requiredAccess?: AccessLevel | AccessLevel[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission,
  requiredRole,
  requiredAccess,
}) => {
  const { isAuthenticated, isLoading, hasPermission, userRole, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const currentRole =
    userRole?.role_code?.toUpperCase() ??
    JSON.parse(localStorage.getItem("user") || "{}")?.role_code?.toUpperCase() ??
    "";

  // Access Level (Admin / Reviewer / Creator / Viewer) is the canonical RBAC
  // driver — set in the user-create dialog. It overrides role_code for
  // page access. Falls back to role-derived access level for legacy users.
  if (requiredAccess) {
    const allowed = Array.isArray(requiredAccess) ? requiredAccess : [requiredAccess];
    const currentAccess = getAccessLevel(user, userRole);
    if (!allowed.includes(currentAccess)) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold text-red-600 mb-4">
              Access Denied
            </h1>
            <p className="text-gray-600">
              You don't have permission to access this page.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Required access level: {allowed.join(" / ")}
            </p>
            <p className="text-sm text-gray-500">
              Your access level: {currentAccess}
            </p>
          </div>
        </div>
      );
    }
  }

  if (requiredRole) {
    const allowedRoles = Array.isArray(requiredRole)
      ? requiredRole.map((r) => r.toUpperCase())
      : [requiredRole.toUpperCase()];

    if (!allowedRoles.includes(currentRole)) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold text-red-600 mb-4">
              Access Denied
            </h1>
            <p className="text-gray-600">
              You don't have permission to access this page.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Required role: {allowedRoles.join(" / ")}
            </p>
            <p className="text-sm text-gray-500">
              Your role: {currentRole || "None"}
            </p>
          </div>
        </div>
      );
    }
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-red-600 mb-4">
            Access Denied
          </h1>
          <p className="text-gray-600">
            You don't have permission to perform this action.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
