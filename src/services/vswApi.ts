/**
 * Valvesheet Workflow (VSW) API client.
 * Talks to /api/vsw/* on the unified backend. Requires JWT bearer token.
 */
import { notifyUnauthorized } from "@/lib/authBus";

const ROOT_API = (
  import.meta.env.VITE_API_URL || "http://localhost:8000/api"
).replace(/\/$/, "");
const API_BASE = ROOT_API + "/vsw";

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
    // Token expired / missing → fire the bus event so AuthProvider can
    // clear local state and bounce the user to /login.
    if (res.status === 401 || res.status === 403) {
      notifyUnauthorized(res.status === 401 ? "Session expired" : "Access denied");
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

export interface ProjectMasterEntry {
  project_id: string;
  project_name: string;
  sap_project_code: string;
  client_name?: string;
  contract_type?: string;
  is_active?: boolean;
}

export type VswSigType = "PREPARED" | "CHECKED" | "REVIEWED" | "APPROVED";
export type VswDecision = "APPROVED" | "REJECTED";

export interface VswWorkflow {
  id: string;
  project_id: string;
  vds_number: string;
  valve_type: string | null;
  piping_class: string | null;
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

export interface VswSignature {
  id: string;
  revision_id: string;
  signature_type: VswSigType;
  signed_by_user_id: string;
  signer_role_at_signing: string | null;
  signer_name_snapshot: string | null;
  decision: VswDecision;
  comment: string | null;
  signed_at: string;
  revoked: boolean;
}

export interface VswChange {
  id: string;
  revision_id: string;
  identifier_code: string | null;
  description: string;
  created_at: string;
}

export interface VswRevision {
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
  signatures: VswSignature[];
  changes: VswChange[];
}

export interface VswWorkflowDetail extends VswWorkflow {
  revisions: VswRevision[];
}

export interface VswStateMachine {
  transitions: Record<string, string[]>;
  signatures_required: Record<string, { non_rfq: string[]; rfq: string[] }>;
  role_signatures: Record<string, string[]>;
  phases: Record<string, string[]>;
}

export interface VswAuditEntry {
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

export const vswApi = {
  // Project master from the same source the legacy generator uses
  listProjects: () =>
    jsonFetch<ProjectMasterEntry[]>(`${ROOT_API}/projects?is_active=true&limit=500`),

  getStateMachine: () => jsonFetch<VswStateMachine>(`${API_BASE}/state-machine`),

  createWorkflow: (payload: {
    project_id: string;
    vds_number: string;
    valve_type?: string;
    piping_class?: string;
    document_title: string;
    starting_state?: string;
    datasheet_json?: Record<string, unknown>;
  }) => jsonFetch<{ workflow_id: string; revision_id: string; label: string }>(
    `${API_BASE}/workflows`,
    { method: "POST", body: JSON.stringify(payload) },
  ),

  listWorkflows: (filters?: { project_id?: string; vds_number?: string }) => {
    const qs = new URLSearchParams();
    if (filters?.project_id) qs.set("project_id", filters.project_id);
    if (filters?.vds_number) qs.set("vds_number", filters.vds_number);
    return jsonFetch<VswWorkflow[]>(`${API_BASE}/workflows${qs.toString() ? `?${qs}` : ""}`);
  },

  getWorkflow: (id: string) =>
    jsonFetch<VswWorkflowDetail>(`${API_BASE}/workflows/${id}`),

  transition: (workflowId: string, payload: {
    target_state: string; is_rfq?: boolean;
    change_identifiers?: { identifier_code?: string; description: string }[];
  }) => jsonFetch<{ revision_id: string; label: string }>(
    `${API_BASE}/workflows/${workflowId}/transition`,
    { method: "POST", body: JSON.stringify(payload) },
  ),

  voidWorkflow: (workflowId: string) =>
    jsonFetch<{ revision_id: string; label: string }>(
      `${API_BASE}/workflows/${workflowId}/void`,
      { method: "POST" },
    ),

  sign: (revisionId: string, payload: {
    signature_type: VswSigType; decision?: VswDecision; comment?: string;
  }) => jsonFetch<{ signature_id: string; new_revision_status: string }>(
    `${API_BASE}/revisions/${revisionId}/sign`,
    { method: "POST", body: JSON.stringify(payload) },
  ),

  upsertDatasheet: (revisionId: string, datasheet_json: Record<string, unknown>) =>
    jsonFetch<{ ok: true }>(
      `${API_BASE}/revisions/${revisionId}/datasheet`,
      { method: "POST", body: JSON.stringify({ datasheet_json }) },
    ),

  getDatasheet: (revisionId: string) =>
    jsonFetch<{ revision_id: string; datasheet_json: Record<string, unknown>; has_cached_excel: boolean; created_at: string; updated_at: string; }>(
      `${API_BASE}/revisions/${revisionId}/datasheet`,
    ),

  audit: (workflowId: string) =>
    jsonFetch<VswAuditEntry[]>(`${API_BASE}/workflows/${workflowId}/audit`),

  async downloadExcel(revisionId: string, suggestedFilename: string): Promise<void> {
    const res = await fetch(`${API_BASE}/revisions/${revisionId}/download`, {
      headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = suggestedFilename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },
};
