/**
 * Revision Workflow API client.
 *
 * Talks to the unified SPE backend (port 8000) at /api/revision/*. Requires
 * a valid JWT in localStorage.auth_token — same token used by authService.
 * Override the base with VITE_REVISION_API_URL if needed.
 */

const ROOT_API = (
  import.meta.env.VITE_API_URL || "http://localhost:8000/api"
).replace(/\/$/, "");
const DEFAULT_BASE = ROOT_API + "/revision";
const API_BASE = import.meta.env.VITE_REVISION_API_URL || DEFAULT_BASE;

// --- Types ---

export interface Workflow {
  id: string;
  project_id: string;
  pms_class_id: string;
  document_title: string;
  document_type: string | null;
  current_phase: string;
  current_state: string;
  current_counter: number;
  current_revision_id: string | null;
  is_locked: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Signature {
  id: string;
  signature_type: "PREPARED" | "CHECKED" | "REVIEWED" | "APPROVED";
  signed_by_user_id: string;
  signer_role_at_signing: string | null;
  signer_name_snapshot: string | null;
  signed_at: string;
  revoked: boolean;
}

export interface ChangeIdentifier {
  id: string;
  identifier_code: string | null;
  description: string;
  created_by_user_id: string | null;
  created_at: string;
}

export interface Revision {
  id: string;
  code: string;
  counter: number;
  revision_label: string;
  is_rfq: boolean;
  status: string;
  included_in_history: boolean;
  issued_by_user_id: string | null;
  issued_at: string;
  superseded_by_revision_id: string | null;
  // Set on P1 side-branch revisions — points at the main-thread revision
  // that was current when this P1 was issued.
  parent_revision_id: string | null;
  signatures: Signature[];
  change_identifiers: ChangeIdentifier[];
}

export interface WorkflowDetail extends Workflow {
  revisions: Revision[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  from_state: string | null;
  to_state: string | null;
  actor_user_id: string | null;
  actor_name_snapshot: string | null;
  performed_at: string;
  extra_metadata: Record<string, unknown> | null;
  revision_id: string | null;
}

export interface StateMachineInfo {
  transitions: Record<string, string[]>;
  signatures_required: Record<string, { non_rfq: string[]; rfq: string[] }>;
  role_signatures: Record<string, string[]>;
  phases: Record<string, string[]>;
}

// Project master row (subset we care about for the dropdown)
export interface ProjectListItem {
  project_id: string;
  project_name: string;
  sap_project_code: string;
  client_name: string;
  contract_type: string;
  is_active: boolean;
}

// PMS class row from the existing piping class endpoint
export interface PmsClassListItem {
  piping_class: string;
  rating: string;
  material: string;
  corrosion_allowance: string;
}

// --- Helpers ---

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
    },
    ...init,
  });
  if (!res.ok) {
    let body = "";
    try {
      const json = await res.json();
      body = typeof json.detail === "string" ? json.detail : JSON.stringify(json);
    } catch {
      try {
        body = await res.text();
      } catch {
        /* noop */
      }
    }
    throw new Error(
      `HTTP ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`,
    );
  }
  return res.json() as Promise<T>;
}

// --- Workflows ---

export async function listWorkflows(filters?: {
  project_id?: string;
  pms_class_id?: string;
}): Promise<Workflow[]> {
  const qs = new URLSearchParams();
  if (filters?.project_id) qs.set("project_id", filters.project_id);
  if (filters?.pms_class_id) qs.set("pms_class_id", filters.pms_class_id);
  const url = `${API_BASE}/workflows${qs.toString() ? `?${qs}` : ""}`;
  return jsonFetch<Workflow[]>(url);
}

export async function getWorkflow(id: string): Promise<WorkflowDetail> {
  return jsonFetch<WorkflowDetail>(`${API_BASE}/workflows/${id}`);
}

export async function createWorkflow(payload: {
  project_id: string;
  pms_class_id: string;
  document_title: string;
  document_type?: string;
  starting_state?: string;
}): Promise<WorkflowDetail> {
  return jsonFetch<WorkflowDetail>(`${API_BASE}/workflows`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Transitions ---

export async function transitionWorkflow(
  workflowId: string,
  payload: {
    target_state: string;
    is_rfq?: boolean;
    change_identifiers?: { identifier_code?: string; description: string }[];
  },
): Promise<Revision> {
  return jsonFetch<Revision>(`${API_BASE}/workflows/${workflowId}/transition`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function issueInfo(workflowId: string): Promise<Revision> {
  return jsonFetch<Revision>(`${API_BASE}/workflows/${workflowId}/issue-info`, {
    method: "POST",
  });
}

export async function voidWorkflow(workflowId: string): Promise<Revision> {
  return jsonFetch<Revision>(`${API_BASE}/workflows/${workflowId}/void`, {
    method: "POST",
  });
}

// --- Signing ---

export async function signRevision(
  revisionId: string,
  payload: { signature_type: string },
): Promise<Signature> {
  return jsonFetch<Signature>(`${API_BASE}/revisions/${revisionId}/sign`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Audit & metadata ---

export async function getAuditLog(workflowId: string): Promise<AuditLogEntry[]> {
  return jsonFetch<AuditLogEntry[]>(
    `${API_BASE}/workflows/${workflowId}/audit`,
  );
}

export async function getStateMachine(): Promise<StateMachineInfo> {
  return jsonFetch<StateMachineInfo>(`${API_BASE}/state-machine`);
}

// --- Master data fetches (used to populate the project dropdown) ---

export async function listProjects(): Promise<ProjectListItem[]> {
  // Existing endpoint mounted by app_user_management/routes/projects.py
  return jsonFetch<ProjectListItem[]>(
    `${ROOT_API}/projects?is_active=true&limit=200`,
  );
}

// Note: PMS classes come from pmsApi.listPipeClasses() — that's a separate
// service hosted at VITE_PMS_API_URL. Import it directly in the page.
