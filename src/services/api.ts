/**
 * API Service for Valve Datasheet Automation
 *
 * This module provides typed API calls to the Python backend.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const ML_API_BASE_URL = import.meta.env.VITE_ML_API_URL || API_BASE_URL;
const AGENT_API_URL = import.meta.env.VITE_AGENT_API_URL || "http://localhost:8001/api";

function isLikelyCompleteVDS(vdsCode: string): boolean {
  const code = (vdsCode || "").toUpperCase().trim();
  return /^(BL|BS|BF|GA|GL|CH|DB|NE)[A-Z][MPT][A-Z0-9]{2,}(JT|R|J|F)$/.test(code);
}

function withLoopbackFallback(url: string): string {
  return url.replace("://localhost", "://127.0.0.1");
}

// === Types ===

export interface DecodedVDS {
  raw_vds: string;
  valve_type_prefix: string;
  valve_type_name: string;
  valve_type_full: string;
  bore_type: string;
  bore_type_name: string;
  piping_class: string;
  end_connection: string;
  end_connection_name: string;
  is_nace_compliant: boolean;
  is_low_temp: boolean;
  is_metal_seated: boolean;
  primary_standard: string;
  valve_design?: string;
  valve_design_name?: string;
  seat_type?: string;
  seat_type_name?: string;
}

export interface ValidationResult {
  vds_no: string;
  is_valid: boolean;
  error: string | null;
}

export interface FieldTraceability {
  source_type: string;
  source_document: string | null;
  source_value: string | null;
  derivation_rule: string | null;
  clause_reference: string | null;
  confidence: number;
  notes: string | null;
}

export interface DatasheetField {
  field_name: string;
  display_name: string;
  section: string;
  value: unknown;
  is_required: boolean;
  is_populated: boolean;
  validation_status: string;
  traceability: FieldTraceability;
}

export interface CompletionInfo {
  populated: number;
  total: number;
  percentage: number;
}

export interface DatasheetMetadata {
  generated_at: string;
  generation_version: string;
  validation_status: string;
  validation_errors: string[];
  warnings: string[];
  completion: CompletionInfo;
}

export interface DatasheetResponse {
  metadata: DatasheetMetadata;
  sections: Record<string, DatasheetField[]>;
}

export interface FlatDatasheetResponse {
  vds_no: string;
  data: Record<string, unknown>;
  validation_status: string;
  completion_percentage: number;
}

export interface ValveTypeInfo {
  prefix: string;
  name: string;
  standards: string[];
  bore_types?: string[];
}

export interface MetadataResponse {
  valve_types: ValveTypeInfo[];
  piping_classes: string[];
  end_connections: { code: string; name: string }[];
  bore_types: { code: string; name: string }[];
  pressure_classes: string[];
}

export interface VDSListResponse {
  vds_numbers: string[];
  total: number;
}

export interface TemplateFieldInfo {
  key: string;
  label: string;
}

export interface ValveTypeTemplate {
  display_name: string;
  prefixes: string[];
  construction_fields: TemplateFieldInfo[];
  material_fields: TemplateFieldInfo[];
}

export interface ValveTypeTemplatesResponse {
  templates: Record<string, ValveTypeTemplate>;
  default_template: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  data_loaded: boolean;
  vds_index_count: number;
  piping_classes_count: number;
}

// ML Prediction Types
export interface MLFlatPredictionResponse {
  vds_no: string;
  data: Record<string, string>;
  rule_based_fields: string[];
  ml_predicted_fields?: string[];
  field_sources?: Record<string, string>;
}

export interface MLPredictionFieldResponse {
  value: string;
  confidence: number;
  source: string;
}

export interface MLPredictionResponse {
  vds_no: string;
  predictions: Record<string, MLPredictionFieldResponse>;
  rule_based_fields: string[];
  ml_predicted_fields: string[];
}

export interface BatchResult {
  vds_no: string;
  status: "success" | "error";
  data?: Record<string, unknown>;
  validation_status?: string;
  completion_percentage?: number;
  error?: string;
}

export interface BatchResponse {
  total: number;
  successful: number;
  failed: number;
  results: BatchResult[];
}

// VDS Suggestion Types
export interface VDSSuggestionItem {
  vds: string;
  source: "index" | "generated";
  description: string;
  is_complete: boolean;
}

export interface VDSSuggestResponse {
  query: string;
  suggestions: VDSSuggestionItem[];
}

// === API Error Handling ===

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      detail = errorData.detail || detail;
    } catch {
      // Ignore JSON parse errors
    }
    // Token expired / missing → notify the auth bus so AuthProvider
    // can log the user out and redirect to /login.
    if (response.status === 401 || response.status === 403) {
      // Lazy import keeps the module dependency-free in any place that
      // doesn't bundle the auth bus.
      void import("@/lib/authBus").then((m) =>
        m.notifyUnauthorized(
          response.status === 401 ? "Session expired" : "Access denied",
        ),
      );
    }
    throw new ApiError(response.status, detail);
  }
  return response.json();
}

// Bearer-token header for the endpoints that need an authenticated user
// (signing, etc.). Other endpoints in this file remain unauthenticated
// to preserve existing behaviour.
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// === API Functions ===

export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);
  return handleResponse<HealthResponse>(response);
}

export async function decodeVDS(vdsNo: string): Promise<DecodedVDS> {
  const response = await fetch(`${API_BASE_URL}/vds/${encodeURIComponent(vdsNo)}/decode`);
  return handleResponse<DecodedVDS>(response);
}

export async function validateVDS(vdsNo: string): Promise<ValidationResult> {
  const response = await fetch(`${API_BASE_URL}/vds/${encodeURIComponent(vdsNo)}/validate`);
  return handleResponse<ValidationResult>(response);
}

export async function generateDatasheet(vdsNo: string): Promise<DatasheetResponse> {
  const response = await fetch(`${API_BASE_URL}/datasheet/${encodeURIComponent(vdsNo)}`);
  return handleResponse<DatasheetResponse>(response);
}

/**
 * Generate a flat datasheet (field_name -> value only)
 */
export async function generateFlatDatasheet(vdsNo: string): Promise<FlatDatasheetResponse> {
  const response = await fetch(`${API_BASE_URL}/datasheet/${encodeURIComponent(vdsNo)}/flat`);
  return handleResponse<FlatDatasheetResponse>(response);
}

export async function generateBatch(vdsNumbers: string[]): Promise<BatchResponse> {
  const response = await fetch(`${API_BASE_URL}/datasheet/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vds_numbers: vdsNumbers }),
  });
  return handleResponse<BatchResponse>(response);
}

/**
 * Get all metadata for form dropdowns
 */
export async function getMetadata(): Promise<MetadataResponse> {
  const response = await fetch(`${API_BASE_URL}/metadata`);
  return handleResponse<MetadataResponse>(response);
}

export async function getValveTypes(): Promise<{ valve_types: ValveTypeInfo[] }> {
  const response = await fetch(`${API_BASE_URL}/metadata/valve-types`);
  return handleResponse<{ valve_types: ValveTypeInfo[] }>(response);
}

export async function getPipingClasses(): Promise<{ piping_classes: string[]; total: number }> {
  const response = await fetch(`${API_BASE_URL}/metadata/piping-classes`);
  return handleResponse<{ piping_classes: string[]; total: number }>(response);
}

/**
 * Get list of indexed VDS numbers
 */
export async function getVDSNumbers(params?: {
  limit?: number;
  offset?: number;
  valve_type?: string;
}): Promise<VDSListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  if (params?.valve_type) searchParams.set("valve_type", params.valve_type);

  const url = `${API_BASE_URL}/metadata/vds-numbers?${searchParams}`;
  const response = await fetch(url);
  return handleResponse<VDSListResponse>(response);
}

export async function getEndConnections(): Promise<{
  end_connections: { code: string; name: string; description: string }[];
}> {
  const response = await fetch(`${API_BASE_URL}/metadata/end-connections`);
  return handleResponse<{ end_connections: { code: string; name: string; description: string }[] }>(response);
}

export async function getBoreTypes(): Promise<{ bore_types: { code: string; name: string }[] }> {
  const response = await fetch(`${API_BASE_URL}/metadata/bore-types`);
  return handleResponse<{ bore_types: { code: string; name: string }[] }>(response);
}

/**
 * Get valve type field templates for dynamic UI rendering
 */
export async function getValveTypeTemplates(): Promise<ValveTypeTemplatesResponse> {
  const response = await fetch(`${API_BASE_URL}/metadata/valve-type-templates`);
  return handleResponse<ValveTypeTemplatesResponse>(response);
}

/**
 * Get VDS autocomplete suggestions (index matches + rule-generated)
 */
export async function getVdsSuggestions(query: string, limit = 15): Promise<VDSSuggestResponse> {
  const url = `${API_BASE_URL}/vds/suggest?q=${encodeURIComponent(query)}&limit=${limit}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    response = await fetch(withLoopbackFallback(url));
  }
  // Backend returns { suggestions: [{vds_no, valve_type, valve_design, seat_type, piping_class}], total }
  // Remap to frontend VDSSuggestionItem shape
  const raw = await handleResponse<{ suggestions: any[]; total: number }>(response);
  return {
    query,
    suggestions: (raw.suggestions ?? []).map((s: any) => {
      const vdsCode: string = s.vds_no ?? s.vds ?? "";
      const parts = [s.valve_type, s.valve_design, s.seat_type, s.piping_class].filter(Boolean);
      return {
        vds: vdsCode,
        source: "generated" as const,
        description: parts.join(" · "),
        is_complete: isLikelyCompleteVDS(vdsCode),
      };
    }),
  };
}

function isEmptyDatasheetValue(v: unknown): boolean {
  if (v == null) return true;
  const s = String(v).trim();
  return s === "" || s === "-";
}

/** Agent rule-engine fields ML often omits or mis-grades — always take agent when present. */
const AGENT_WINS_MATERIAL_KEYS = new Set<string>([
  "seal_material",
  "spring_material",
  "back_seat_material",
  "disc_material",
]);

/**
 * ML `/ml/predict/.../flat` often returns a sparse dict (only model-filled keys).
 * The Materials wizard step uses `Object.keys(data)` as `activeFields`, so omitted
 * keys never render — e.g. globe **Seal** / **Spring** even when the rule-engine
 * agent has them. Merge any empty material slots from the agent datasheet.
 */
export async function mergeMaterialsFromAgent(
  vdsNo: string,
  mlData: Record<string, unknown>,
  materialFieldKeys: readonly string[],
): Promise<Record<string, unknown>> {
  const merged: Record<string, unknown> = { ...mlData };
  try {
    const agentUrl = `${AGENT_API_URL}/datasheets/${encodeURIComponent(vdsNo)}`;
    const agentResp = await fetch(withLoopbackFallback(agentUrl));
    if (!agentResp.ok) return merged;
    const agentData = await agentResp.json();
    const src = (agentData.datasheet || agentData.data) as Record<string, unknown> | undefined;
    if (!src || typeof src !== "object") return merged;
    for (const key of materialFieldKeys) {
      const v = src[key];
      if (isEmptyDatasheetValue(v)) continue;
      const agentWins = AGENT_WINS_MATERIAL_KEYS.has(key);
      if (!agentWins && !isEmptyDatasheetValue(merged[key])) continue;
      merged[key] = typeof v === "string" ? v : String(v);
    }
  } catch {
    /* Agent unavailable — keep ML-only payload */
  }
  return merged;
}

/**
 * Get ML predictions for a VDS number (flat format with only non-empty fields)
 */
export async function getMLPrediction(vdsNo: string, includeEmpty: boolean = false): Promise<MLFlatPredictionResponse> {
  const params = new URLSearchParams();
  if (includeEmpty) params.set("include_empty", "true");

  // Try ML API first, fall back to Agent API (serves from VDS index)
  try {
    const url = `${ML_API_BASE_URL}/ml/predict/${encodeURIComponent(vdsNo)}/flat?${params}`;
    const response = await fetch(url);
    if (response.ok) {
      return handleResponse<MLFlatPredictionResponse>(response);
    }
  } catch {
    // ML API not available, try agent API fallback
  }

  // Fallback: Agent API at /api/datasheets/{code} (serves from 679-spec VDS index)
  const agentUrl = `${AGENT_API_URL}/datasheets/${encodeURIComponent(vdsNo)}`;
  const agentResp = await fetch(agentUrl);
  if (!agentResp.ok) {
    const text = await agentResp.text().catch(() => "");
    throw new Error(text || `Datasheet not found for ${vdsNo}`);
  }
  const agentData = await agentResp.json();
  // Map agent response format to ML format
  return {
    vds_no: agentData.vds_code || vdsNo,
    data: agentData.datasheet || agentData.data || {},
    rule_based_fields: Object.keys(agentData.datasheet || agentData.data || {}),
    field_sources: agentData.field_sources || {},
  };
}

/**
 * Get ML predictions with confidence scores
 */
export async function getMLPredictionWithConfidence(vdsNo: string, includeEmpty: boolean = false): Promise<MLPredictionResponse> {
  const params = new URLSearchParams();
  if (includeEmpty) params.set("include_empty", "true");
  const url = `${ML_API_BASE_URL}/ml/predict/${encodeURIComponent(vdsNo)}?${params}`;
  const response = await fetch(url);
  return handleResponse<MLPredictionResponse>(response);
}

// === Download Types ===

export interface DownloadFileMetadata {
  id: string;
  original_filename: string;
  stored_filename: string;
  file_type: "pdf" | "csv" | "xlsx";
  vds_number: string;
  project_code?: string | null;
  project_name?: string | null;
  phase?: string | null;
  revision_code?: string | null;
  file_size_bytes: number;
  created_at: string;
  content_type: string;
}

export interface DownloadListResponse {
  downloads: DownloadFileMetadata[];
  total: number;
}

export interface UploadResponse {
  id: string;
  filename: string;
  message: string;
}

// === Valvesheet Registry Types ===

export interface ValvesheetVersionEntry {
  version: number;
  status: string;
  author: string;
  date: string;
  changes: string;
  review_note?: string | null;
}

export interface ValvesheetRecord {
  id: string;
  vds_number: string;
  piping_class: string;
  status: "pending" | "pending_review" | "pending_approval" | "reviewed" | "approved" | "void";
  requires_revision: boolean;
  reviewer_comment?: string | null;
  generated_data_json?: Record<string, unknown> | null;
  project_name?: string | null;
  project_code?: string | null;
  latest_download_id?: string | null;
  latest_filename?: string | null;
  file_type?: string | null;
  created_at: string;
  updated_at: string;
  versions: ValvesheetVersionEntry[];
}

export interface ValvesheetListResponse {
  records: ValvesheetRecord[];
  total: number;
}

export interface ValvesheetUpsertRequest {
  vds_number: string;
  piping_class?: string;
  status?: "pending" | "pending_review" | "pending_approval" | "reviewed" | "approved" | "void";
  requires_revision?: boolean;
  reviewer_comment?: string;
  generated_data_json?: Record<string, unknown>;
  project_name?: string;
  project_code?: string;
  author?: string;
  change_note?: string;
}

export interface ValvesheetStatusUpdateRequest {
  status: "pending" | "pending_review" | "pending_approval" | "reviewed" | "approved" | "void";
  requires_revision?: boolean;
  reviewer_comment?: string;
  author?: string;
  change_note?: string;
}

export interface VDSRevisionLogEntry {
  id: string;
  valvesheet_id?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  project_code?: string | null;
  vds_number: string;
  phase?: string | null;
  option_name: string;
  option_label?: string | null;
  option_short?: string | null;
  revision_code: string;
  submission_version: number;
  tracking_code: string;
  action: string;
  status: string;
  excel_filename?: string | null;
  source_note?: string | null;
  metadata_json?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface VDSRevisionLogListResponse {
  records: VDSRevisionLogEntry[];
  total: number;
}

// === Download API Functions ===

export async function uploadExportFile(
  file: Blob,
  filename: string,
  fileType: "pdf" | "csv" | "xlsx",
  vdsNumber: string,
  metadata?: {
    project_code?: string;
    project_name?: string;
    phase?: string;
    revision_code?: string;
  }
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file, filename);
  formData.append("file_type", fileType);
  formData.append("vds_number", vdsNumber);
  if (metadata?.project_code) formData.append("project_code", metadata.project_code);
  if (metadata?.project_name) formData.append("project_name", metadata.project_name);
  if (metadata?.phase) formData.append("phase", metadata.phase);
  if (metadata?.revision_code) formData.append("revision_code", metadata.revision_code);

  const response = await fetch(`${API_BASE_URL}/downloads/upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<UploadResponse>(response);
}

export async function listDownloads(params?: {
  file_type?: string;
  limit?: number;
  offset?: number;
}): Promise<DownloadListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.file_type) searchParams.set("file_type", params.file_type);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));

  const response = await fetch(`${API_BASE_URL}/downloads?${searchParams}`);
  return handleResponse<DownloadListResponse>(response);
}

export function getDownloadUrl(downloadId: string): string {
  return `${API_BASE_URL}/downloads/${downloadId}`;
}

export async function deleteDownload(downloadId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/downloads/${downloadId}`, {
    method: "DELETE",
  });
  await handleResponse(response);
}

// === Valvesheet Registry API ===

export async function listValvesheets(params?: {
  status?: "pending" | "pending_review" | "pending_approval" | "reviewed" | "approved" | "void";
  limit?: number;
  offset?: number;
}): Promise<ValvesheetListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const response = await fetch(`${API_BASE_URL}/valvesheets?${searchParams}`);
  return handleResponse<ValvesheetListResponse>(response);
}

export async function getValvesheet(vdsNumber: string): Promise<ValvesheetRecord> {
  const response = await fetch(`${API_BASE_URL}/valvesheets/${encodeURIComponent(vdsNumber)}`);
  return handleResponse<ValvesheetRecord>(response);
}

export async function upsertValvesheet(payload: ValvesheetUpsertRequest): Promise<ValvesheetRecord> {
  const response = await fetch(`${API_BASE_URL}/valvesheets/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<ValvesheetRecord>(response);
}

export async function createValvesheet(payload: ValvesheetUpsertRequest): Promise<ValvesheetRecord> {
  const response = await fetch(`${API_BASE_URL}/valvesheets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<ValvesheetRecord>(response);
}

export async function replaceValvesheet(
  vdsNumber: string,
  payload: ValvesheetUpsertRequest
): Promise<ValvesheetRecord> {
  const response = await fetch(`${API_BASE_URL}/valvesheets/${encodeURIComponent(vdsNumber)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<ValvesheetRecord>(response);
}

export async function updateValvesheetStatus(
  vdsNumber: string,
  payload: ValvesheetStatusUpdateRequest
): Promise<ValvesheetRecord> {
  const response = await fetch(`${API_BASE_URL}/valvesheets/${encodeURIComponent(vdsNumber)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<ValvesheetRecord>(response);
}

export async function deleteValvesheet(vdsNumber: string): Promise<{ message: string; vds_number: string }> {
  const response = await fetch(`${API_BASE_URL}/valvesheets/${encodeURIComponent(vdsNumber)}`, {
    method: "DELETE",
  });
  return handleResponse<{ message: string; vds_number: string }>(response);
}

export async function listVdsRevisionLogs(params?: {
  vds_number?: string;
  project_id?: string;
  project_code?: string;
  option_name?: string;
  phase?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<VDSRevisionLogListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.vds_number) searchParams.set("vds_number", params.vds_number);
  if (params?.project_id) searchParams.set("project_id", params.project_id);
  if (params?.project_code) searchParams.set("project_code", params.project_code);
  if (params?.option_name) searchParams.set("option_name", params.option_name);
  if (params?.phase) searchParams.set("phase", params.phase);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const response = await fetch(`${API_BASE_URL}/vds-revision-log?${searchParams}`);
  return handleResponse<VDSRevisionLogListResponse>(response);
}

// === VDS revision signatures (sign / reject with comment) ===

export type VDSSignatureType = "PREPARED" | "CHECKED" | "REVIEWED" | "APPROVED";
export type VDSDecision = "APPROVED" | "REJECTED";

export interface VDSSignature {
  id: string;
  vds_revision_log_id: string;
  signature_type: VDSSignatureType;
  signed_by_user_id: string | null;
  signer_role_at_signing: string | null;
  signer_name_snapshot: string | null;
  decision: VDSDecision;
  comment: string | null;
  signed_at: string;
  revoked: boolean;
}

export interface VDSSignPayload {
  signature_type: VDSSignatureType;
  decision?: VDSDecision;
  comment?: string;
}

/** Bootstrap the initial IDC (Inter-Discipline Check) vds_revision_log row
 *  for a valvesheet that has none yet. Idempotent — returns the existing
 *  row's id if one already exists. */
export async function bootstrapVdsRevisionLog(
  vdsNumber: string,
): Promise<{ log_id: string; created: boolean }> {
  const response = await fetch(
    `${API_BASE_URL}/vds-revision-log/bootstrap/${encodeURIComponent(vdsNumber)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    },
  );
  return handleResponse<{ log_id: string; created: boolean }>(response);
}

/** List every signature on a single vds_revision_log row. */
export async function listVdsRevisionSignatures(
  logId: string,
): Promise<VDSSignature[]> {
  const response = await fetch(
    `${API_BASE_URL}/vds-revision-log/${encodeURIComponent(logId)}/signatures`,
    { headers: { ...authHeaders() } },
  );
  return handleResponse<VDSSignature[]>(response);
}

/** Apply a signature (APPROVE or REJECT with comment) to a revision log row.
 *  Role mapping enforced server-side:
 *    MAKER    -> PREPARED
 *    CHECKER  -> CHECKED, REVIEWED
 *    APPROVER -> APPROVED
 *  Same user cannot sign more than one slot per row. */
export async function signVdsRevisionLog(
  logId: string,
  payload: VDSSignPayload,
): Promise<VDSSignature> {
  const response = await fetch(
    `${API_BASE_URL}/vds-revision-log/${encodeURIComponent(logId)}/sign`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(payload),
    },
  );
  return handleResponse<VDSSignature>(response);
}

/** Revoke a previously-applied signature (APPROVER role only). */
export async function revokeVdsRevisionSignature(
  logId: string,
  signatureId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/vds-revision-log/${encodeURIComponent(logId)}/signatures/${encodeURIComponent(signatureId)}`,
    { method: "DELETE", headers: { ...authHeaders() } },
  );
  if (!response.ok && response.status !== 204) {
    throw new ApiError(response.status, `Revoke failed: HTTP ${response.status}`);
  }
}


// === Default Export ===

const api = {
  checkHealth,
  decodeVDS,
  validateVDS,
  generateDatasheet,
  generateFlatDatasheet,
  generateBatch,
  getMetadata,
  getValveTypes,
  getPipingClasses,
  getVDSNumbers,
  getEndConnections,
  getBoreTypes,
  getValveTypeTemplates,
  getVdsSuggestions,
  getMLPrediction,
  getMLPredictionWithConfidence,
  uploadExportFile,
  listDownloads,
  listValvesheets,
  getValvesheet,
  createValvesheet,
  replaceValvesheet,
  upsertValvesheet,
  updateValvesheetStatus,
  deleteValvesheet,
  listVdsRevisionLogs,
  bootstrapVdsRevisionLog,
  listVdsRevisionSignatures,
  signVdsRevisionLog,
  revokeVdsRevisionSignature,
  getDownloadUrl,
  deleteDownload,
  mergeMaterialsFromAgent,
};

export default api;
