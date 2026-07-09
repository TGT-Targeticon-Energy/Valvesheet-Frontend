type UserRoleEntry = { role_code?: string } | null | undefined;
type UserLike =
  | { role_code?: string; roles?: Array<{ role_code?: string }> }
  | null
  | undefined;

// ── Canonical role lists (single source of truth) ────────────────────
// Used by AppSidebar.tsx (menu visibility) and App.tsx (<ProtectedRoute
// requiredRole={...}>). When the access matrix changes, edit these and
// both sidebar + route guards stay in sync automatically.
export const ADMIN_ROLES_LIST = ["ENG_ADMIN", "ADMIN"];
export const CREATOR_ROLES_LIST = ["PROC_ENG", "MECH_ENG", "ENGINEER"];
export const APPROVER_ROLES_LIST = ["PIP_LEAD", "QA_MGR", "PROJECT_MGR", "REVIEWER"];

// Composed permission groups — match the "can …" checks elsewhere.
export const CAN_GENERATE_ROLES = [...ADMIN_ROLES_LIST, ...CREATOR_ROLES_LIST];
export const CAN_APPROVE_ROLES = [...ADMIN_ROLES_LIST, ...APPROVER_ROLES_LIST];
export const ALL_OPERATIONAL_ROLES = [
  ...ADMIN_ROLES_LIST,
  ...CREATOR_ROLES_LIST,
  ...APPROVER_ROLES_LIST,
];

// ── Access Level (primary RBAC driver) ──────────────────────────────
// Access Level is the canonical permission level set in the user-creation
// dialog. It overrides role_code for sidebar visibility and route guarding.
// Role code remains as job-title metadata (ENG_ADMIN, PROC_ENG, …) but does
// NOT decide what the user can see.
//
// The four levels (descending privilege):
//   Admin    — full access incl. user/project administration
//   Reviewer — approve flow + downloads, no generators or admin
//   Creator  — generators + own submissions ("Pending for Approval")
//              + downloads
//   Viewer   — dashboard only (read-only by default)
//
// If access_level is missing on a user record, fall back to deriving it
// from role_code so legacy users keep working until re-saved.
export type AccessLevel = "Admin" | "Reviewer" | "Creator" | "Viewer";

export const ACCESS_LEVEL_OPTIONS: AccessLevel[] = [
  "Admin",
  "Reviewer",
  "Creator",
  "Viewer",
];

/** Access levels currently disabled in the UI (rendered but not selectable).
 *  Viewer is parked for now — read-only flows aren't fully fleshed out yet.
 *  Remove an entry from this set to re-enable selection. Existing users
 *  whose access_level is in this set still keep their derived permissions
 *  via getAccessLevel() — only NEW assignment is blocked. */
export const DISABLED_ACCESS_LEVELS = new Set<AccessLevel>(["Viewer"]);

type WithAccess = { access_level?: string | null } | null | undefined;

/** Derive access level from a (user, userRole) pair. Falls back to role_code
 *  mapping if access_level is empty (legacy records). */
export function getAccessLevel(user: WithAccess, userRole: WithAccess): AccessLevel {
  const explicit = (user?.access_level || userRole?.access_level || "").trim();
  if (explicit) {
    const v = explicit.toLowerCase();
    if (v === "admin")    return "Admin";
    if (v === "reviewer") return "Reviewer";
    if (v === "creator")  return "Creator";
    if (v === "viewer")   return "Viewer";
  }
  // Fallback: derive from role_code (legacy users without access_level set)
  const code = ((user as any)?.role_code || (userRole as any)?.role_code || "").toUpperCase();
  if (ADMIN_ROLES_LIST.includes(code))    return "Admin";
  if (APPROVER_ROLES_LIST.includes(code)) return "Reviewer";
  if (CREATOR_ROLES_LIST.includes(code))  return "Creator";
  return "Viewer";
}

export const isAccessAdmin    = (lvl: AccessLevel) => lvl === "Admin";
export const isAccessReviewer = (lvl: AccessLevel) => lvl === "Reviewer";
export const isAccessCreator  = (lvl: AccessLevel) => lvl === "Creator";
export const isAccessViewer   = (lvl: AccessLevel) => lvl === "Viewer";

/** True when the access level grants the right to use the generators. */
export const canGenerateByAccess = (lvl: AccessLevel) =>
  lvl === "Admin" || lvl === "Creator";

/** True when the access level grants the right to approve / review. */
export const canApproveByAccess = (lvl: AccessLevel) =>
  lvl === "Admin" || lvl === "Reviewer";

/** True when the access level can view the downloads tab (everyone except
 *  Viewer can — Viewers stay on dashboard only). */
export const canViewDownloadsByAccess = (lvl: AccessLevel) => lvl !== "Viewer";

const ADMIN_ROLES = new Set(ADMIN_ROLES_LIST);
const CREATOR_ROLES = new Set(CREATOR_ROLES_LIST);
const APPROVER_ROLES = new Set(APPROVER_ROLES_LIST);

export function getRoleCode(userRole: UserRoleEntry, user: UserLike): string {
  const directRole = userRole?.role_code || user?.role_code;
  if (directRole) return directRole;

  const mappedRole = user?.roles?.[0]?.role_code;
  return mappedRole || "";
}

export function isAdminRole(roleCode: string): boolean {
  return ADMIN_ROLES.has(roleCode);
}

export function isCreatorRole(roleCode: string): boolean {
  return CREATOR_ROLES.has(roleCode);
}

export function isApproverRole(roleCode: string): boolean {
  return APPROVER_ROLES.has(roleCode);
}

export function canGenerateDatasheet(roleCode: string): boolean {
  return isAdminRole(roleCode) || isCreatorRole(roleCode);
}

export function canReviewApprovals(roleCode: string): boolean {
  return isAdminRole(roleCode) || isApproverRole(roleCode);
}
