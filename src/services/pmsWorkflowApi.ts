/**
 * PMS Workflow API client.
 * Talks to /api/pms-workflow/* on the PMS Generator backend.
 *
 * The base URL is configured via `VITE_PMS_API_URL` and defaults to
 * http://localhost:8004 for local dev (the PMS Generator FastAPI port).
 * On Render, set this to the deployed PMS backend URL.
 *
 * Auth: re-uses the same JWT bearer token issued by the VDS user-
 * management backend (stored in localStorage under `auth_token`). The
 * PMS backend verifies that JWT against the shared SECRET_KEY.
 */
import { notifyUnauthorized } from "@/lib/authBus";

// Strip a trailing /api or /api/ from the env var so that both
// "http://localhost:8004" and "http://localhost:8004/api" work correctly.
const ROOT = (
  import.meta.env.VITE_PMS_API_URL || "http://localhost:8004"
).replace(/\/api\/?$/, "").replace(/\/$/, "");
const API_BASE = ROOT + "/api/pms-workflow";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
    ...init,
  });
  if (!res.ok) {
    // Only a true 401 (token invalid / expired) should trigger a logout.
    // A 403 means "authenticated but not authorised for this action" — show
    // an error toast but DO NOT log the user out.
    if (res.status === 401) {
      notifyUnauthorized("Session expired");
    }
    let body = "";
    try {
      const j = await res.json();
      body = typeof j.detail === "string" ? j.detail : JSON.stringify(j);
    } catch {
      try { body = await res.text(); } catch {}
    }
    throw new Error(`HTTP ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ──────────────────────────────────────────────────────────

export type PmsSigType = "PREPARED" | "CHECKED" | "REVIEWED" | "APPROVED";
export type PmsDecision = "APPROVED" | "REJECTED";

export interface PmsWorkflow {
  id: string;
  project_id: string;
  piping_class: string;
  document_title: string;
  current_phase: string;
  current_state: string;
  current_counter: number;
  current_revision_id: string | null;
  is_locked: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PmsSignature {
  id: string;
  revision_id: string;
  signature_type: PmsSigType;
  signed_by_user_id: string;
  signer_role_at_signing: string | null;
  signer_name_snapshot: string | null;
  decision: PmsDecision;
  comment: string | null;
  signed_at: string;
  revoked: boolean;
}

export interface PmsChange {
  id: string;
  revision_id: string;
  identifier_code: string | null;
  description: string;
  created_at: string;
}

export interface PmsRevision {
  id: string;
  workflow_id: string;
  code: string;
  counter: number;
  revision_label: string;
  is_rfq: boolean;
  status: string;
  included_in_history: boolean;
  issued_by_user_id: string | null;
  issued_at: string;
  superseded_by_revision_id: string | null;
  parent_revision_id: string | null;
  signatures: PmsSignature[];
  changes: PmsChange[];
}

export interface PmsWorkflowDetail extends PmsWorkflow {
  revisions: PmsRevision[];
}

export interface PmsStateMachine {
  transitions: Record<string, string[]>;
  signatures_required: Record<string, { non_rfq: string[]; rfq: string[] }>;
  role_signatures: Record<string, string[]>;
  signature_order: string[];
  phases: Record<string, string[]>;
  editable_keys: string[];
}

export interface PmsAuditEntry {
  id: string;
  workflow_id: string;
  revision_id: string | null;
  action: string;
  from_state: string | null;
  to_state: string | null;
  actor_user_id: string | null;
  actor_name_snapshot: string | null;
  performed_at: string;
  extra_metadata: Record<string, unknown> | null;
}

export interface PmsClassEntry {
  piping_class: string;
  rating: string;
  material: string;
  corrosion_allowance: string;
}

export interface PmsOptions {
  pressure_ratings: string[];
  disabled_pressure_ratings?: string[];
  materials: string[];
  corrosion_allowances: string[];
  services: string[];
  services_allow_custom?: boolean;
  rating_restrictions?: {
    restricted_materials?: string[];
    allowed_ratings?: string[];
    message?: string;
    tubing_only_ratings?: string[];
    tubing_only_materials?: string[];
    tubing_only_message?: string;
  };
}

// ─── API methods ────────────────────────────────────────────────────

export const pmsWorkflowApi = {
  getStateMachine: () => jsonFetch<PmsStateMachine>(`${API_BASE}/state-machine`),

  // Returns distinct piping classes saved in the PMS store, each with
  // the rating / material / corrosion_allowance needed by createWorkflow.
  listSavedClasses: () =>
    jsonFetch<PmsClassEntry[]>(`${API_BASE}/pms-classes`),

  // Cross-namespace alias for /api/options/all — same lists used by the
  // existing PMS Generator page (pressure ratings, materials, CAs,
  // services). Lets the Create page derive the piping class via the
  // engine instead of relying on saved classes.
  getOptions: () => jsonFetch<PmsOptions>(`${API_BASE}/options`),

  listWorkflows: (filters?: { project_id?: string; piping_class?: string }) => {
    const qs = new URLSearchParams();
    if (filters?.project_id) qs.set("project_id", filters.project_id);
    if (filters?.piping_class) qs.set("piping_class", filters.piping_class);
    return jsonFetch<PmsWorkflow[]>(`${API_BASE}/workflows${qs.toString() ? `?${qs}` : ""}`);
  },

  createWorkflow: (payload: {
    project_id: string;
    piping_class: string;
    document_title?: string;
    rating?: string;
    material?: string;
    corrosion_allowance?: string;
    service?: string;
    design_pressure_barg?: number;
    design_temp_c?: number;
    mdmt_c?: number;
    joint_type?: string;
  }) =>
    jsonFetch<{ workflow_id: string; revision_id: string; label: string }>(
      `${API_BASE}/workflows`,
      { method: "POST", body: JSON.stringify(payload) },
    ),

  getWorkflow: (id: string) =>
    jsonFetch<PmsWorkflowDetail>(`${API_BASE}/workflows/${id}`),

  transition: (workflowId: string, payload: {
    target_state: string;
    is_rfq?: boolean;
    change_identifiers?: { identifier_code?: string; description: string }[];
  }) =>
    jsonFetch<{ revision_id: string; label: string }>(
      `${API_BASE}/workflows/${workflowId}/transition`,
      { method: "POST", body: JSON.stringify(payload) },
    ),

  voidWorkflow: (workflowId: string) =>
    jsonFetch<{ revision_id: string; label: string }>(
      `${API_BASE}/workflows/${workflowId}/void`,
      { method: "POST" },
    ),

  audit: (workflowId: string) =>
    jsonFetch<PmsAuditEntry[]>(`${API_BASE}/workflows/${workflowId}/audit`),

  sign: (revisionId: string, payload: {
    signature_type: PmsSigType;
    decision?: PmsDecision;
    comment?: string;
  }) =>
    jsonFetch<{ signature_id: string; new_revision_status: string }>(
      `${API_BASE}/revisions/${revisionId}/sign`,
      { method: "POST", body: JSON.stringify(payload) },
    ),

  getSnapshot: (revisionId: string) =>
    jsonFetch<{
      revision_id: string;
      payload: Record<string, unknown>;
      has_cached_excel: boolean;
      created_at: string;
      updated_at: string;
    }>(`${API_BASE}/revisions/${revisionId}/snapshot`),

  upsertSnapshot: (
    revisionId: string,
    payload: Record<string, unknown>,
    options?: { full_replace?: boolean },
  ) =>
    jsonFetch<{ ok: true }>(
      `${API_BASE}/revisions/${revisionId}/snapshot`,
      {
        method: "POST",
        body: JSON.stringify({ payload, full_replace: options?.full_replace ?? false }),
      },
    ),

  async downloadExcel(revisionId: string, suggestedFilename: string): Promise<void> {
    const res = await fetch(`${API_BASE}/revisions/${revisionId}/download`, {
      headers: { ...authHeaders() },
    });
    if (!res.ok) {
      if (res.status === 401) notifyUnauthorized("Session expired");
      throw new Error(`HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = suggestedFilename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },
};

// Re-export the VDS API's project listing — same project master used for valvesheets.
export { vswApi as projectApi, type ProjectMasterEntry } from "@/services/vswApi";
