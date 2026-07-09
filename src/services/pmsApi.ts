/**
 * PMS Generator API Service
 *
 * Talks to the new backend (https://pms-generator-final.onrender.com/api),
 * which exposes two surfaces:
 *
 *   PMS AI Agent (used by PMSAgentPage)
 *     POST /pms-agent/chat                  — natural-language slot-filling chat
 *     POST /pms-agent/download-excel        — single-class PMS Excel
 *     POST /pms-agent/download-zip          — bulk-class PMS ZIP
 *     GET/PUT/PATCH/DELETE /pms-agent/sessions[/{id}]  — chat history (see pmsAgentHistory.ts)
 *
 *   PMS Configurator (used by PMSGeneratorPage)
 *     GET  /options/all                     — all four dropdown lists
 *     POST /resolve-class                   — class code + P-T + code factors
 *     POST /export/excel                    — engineer-driven Excel export
 *     GET  /ai/status                       — is AI configured on the server?
 *     POST /ai/pms-notes                    — Claude-authored engineering notes
 */

const PMS_API_BASE_URL =
  import.meta.env.VITE_PMS_API_URL || "http://localhost:8002/api";

// === Shared types reused by PMSAgentPage ===

/** Body for /download-excel — also the per-item shape inside /download-zip. */
export interface PMSRequest {
  piping_class: string;
  material: string;
  corrosion_allowance: string;
  service: string;
  /** Optional — chat populates from `slots.rating` so the backend doesn't
   *  have to reverse-engineer it. */
  rating?: string;
  /** Optional design conditions — when omitted the backend applies
   *  defaults (cold-point pressure, 50 °C, MDMT -29 °C, Seamless joint). */
  design_pressure_barg?: number | null;
  design_temp_c?: number | null;
  mdmt_c?: number | null;
  joint_type?: string;
}

// === Error handling ===

export class PMSApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = "PMSApiError";
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
    throw new PMSApiError(response.status, detail);
  }
  return response.json();
}

// === /api/pms-agent/chat ===

export interface PMSAgentHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PMSAgentClassMatch {
  piping_class: string;
  rating: string;
  material: string;
  corrosion_allowance: string;
  pt_preview: string;
  score: number;
}

export interface PMSAgentParsedQuery {
  piping_class: string | null;
  rating: string | null;
  material: string | null;
  corrosion_allowance: string | null;
  service: string | null;
  design_temp_c: number | null;
  design_pressure_barg: number | null;
  intent: "generate" | "list" | "info" | "unknown";
}

export interface PMSAgentAction {
  type: "open_generator" | "list_only" | "none";
  piping_class: string | null;
  material: string | null;
  corrosion_allowance: string | null;
  service: string | null;
  design_pressure_barg: number | null;
  design_temp_c: number | null;
}

export interface PMSAgentSlotState {
  rating: string | null;
  material: string | null;
  corrosion_allowance: string | null;
  service: string | null;
  missing: ("rating" | "material" | "corrosion_allowance" | "service")[];
  complete: boolean;
}

export interface PMSAgentFieldSuggestion {
  field: "rating" | "material" | "corrosion_allowance" | "service";
  provided: string;
  suggestions: string[];
}

export interface PMSAgentResponse {
  reply: string;
  interpreted: PMSAgentParsedQuery;
  matched_classes: PMSAgentClassMatch[];
  suggested_action: PMSAgentAction;
  slots: PMSAgentSlotState;
  field_suggestions: PMSAgentFieldSuggestion[];
  available_values: {
    rating?: string[];
    material?: string[];
    corrosion_allowance?: string[];
    service?: string[];
  };
  allow_bulk_download: boolean;
}

export async function chatWithPMSAgent(
  prompt: string,
  history: PMSAgentHistoryTurn[] = [],
  sessionId?: string,
): Promise<PMSAgentResponse> {
  // The session id (when supplied) and user id (from auth) let the
  // backend's per-turn query log join each row back to its parent chat
  // session for full-context replay. Both are optional; chat works
  // without them, the analytics table just gets nulls.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const u =
      (await import("@/services/authService")).authService.getCurrentUser();
    if (u?.user_id) headers["X-User-Id"] = u.user_id;
  } catch {
    /* anonymous fallback */
  }
  const response = await fetch(`${PMS_API_BASE_URL}/pms-agent/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt, history, session_id: sessionId ?? null }),
  });
  return handleResponse<PMSAgentResponse>(response);
}

// === /api/pms-agent/download-excel ===

async function downloadBlob(path: string, body: unknown): Promise<Blob> {
  const response = await fetch(`${PMS_API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      detail = errorData.detail || detail;
    } catch {
      const text = await response.text().catch(() => "");
      detail = text || detail;
    }
    throw new PMSApiError(response.status, detail);
  }
  return response.blob();
}

export async function downloadPMSExcel(req: PMSRequest): Promise<Blob> {
  return downloadBlob("/pms-agent/download-excel", req);
}

export async function downloadBulkPMSZip(classes: PMSRequest[]): Promise<Blob> {
  return downloadBlob("/pms-agent/download-zip", { classes });
}

// === /api/pms-agent/save — keep a class in the user's shortlist ===

export interface SavePMSRequest {
  piping_class: string;
  rating: string;
  material: string;
  corrosion_allowance: string;
  service?: string;
  design_pressure_barg?: number | null;
  design_temp_c?: number | null;
  mdmt_c?: number | null;
  joint_type?: string;
  note?: string;
  /** When true, overwrite an existing saved PMS. Default false: the
   *  backend returns 409 if the same (user, class, rating, material, CA,
   *  service) is already saved, so the UI can prompt the user before
   *  clobbering the previous payload. */
  force?: boolean;
}

export interface SavePMSExistingMeta {
  id: number;
  saved_at: number;
  updated_at: number;
  design_pressure_barg: number | null;
  design_temp_c: number | null;
  mdmt_c: number | null;
  joint_type: string | null;
}

export interface SavePMSResponse {
  ok: boolean;
  id: number;
  /** false when the save was an UPSERT (the row already existed). */
  created: boolean;
  saved_at: number;
}

/** Successful save outcome. */
export type SavePMSOk = { kind: "saved"; response: SavePMSResponse };

/** Backend refused to overwrite — frontend should confirm with the user
 *  and retry with `force: true`. */
export type SavePMSConflict = { kind: "conflict"; existing: SavePMSExistingMeta };

export type SavePMSOutcome = SavePMSOk | SavePMSConflict;

async function _userIdHeader(): Promise<Record<string, string>> {
  // Reuse the session-history user-id header so saves are per-user.
  const u = (await import("@/services/authService")).authService.getCurrentUser();
  return u?.user_id ? { "X-User-Id": u.user_id } : {};
}

export async function savePMS(req: SavePMSRequest): Promise<SavePMSOutcome> {
  const headers = {
    "Content-Type": "application/json",
    ...(await _userIdHeader()),
  };
  const response = await fetch(`${PMS_API_BASE_URL}/pms-agent/save`, {
    method: "POST",
    headers,
    body: JSON.stringify(req),
  });

  if (response.status === 409) {
    // 409 carries structured info about the existing row so the
    // confirmation modal can render "Last saved on …".
    const body = await response.json().catch(() => ({}));
    const detail = body?.detail ?? body;
    const existing = (detail?.existing ?? {}) as SavePMSExistingMeta;
    return { kind: "conflict", existing };
  }

  const parsed = await handleResponse<SavePMSResponse>(response);
  return { kind: "saved", response: parsed };
}

// === /api/options/all — dropdown lists for the Generate PMS form ===

/**
 * Server-side rule: certain "exotic" materials (Copper / Titanium /
 * GRE / CPVC / CuNi) only have catalogued PMS classes at low-pressure
 * ratings (150# / EEMUA 20 bar). The backend rejects any other (rating,
 * material) combination at /api/resolve-class with HTTP 422. This
 * payload mirrors that rule to the SPA so dropdowns can disable
 * invalid pairings BEFORE the user clicks "Generate".
 *
 * Backend single source of truth: `app/data/class_naming.json` →
 * `rating_restrictions`. Backend computes the UI-friendly form here
 * (resolves abstract §5.5 digits into actual material/rating labels)
 * so the SPA doesn't need to re-implement the digit logic.
 */
export interface PMSRatingRestrictions {
  // ── Material → rating direction ──
  // (exotic materials are catalogued at only a subset of ratings)
  /** Materials (matching the strings in `materials`) that are
   *  restricted to a subset of ratings. */
  restricted_materials: string[];
  /** Ratings (matching the strings in `pressure_ratings`) that the
   *  restricted materials are allowed at. Anything not in this list
   *  is invalid when paired with a restricted material. */
  allowed_ratings: string[];
  /** Human-readable hint shown next to the disabled options. */
  message: string;

  // ── Rating → material direction ──
  // (some rating series — e.g. Tubing A/B/C instrument tubing —
  //  only support a small subset of materials)
  /** Ratings whose selection restricts the material dropdown. */
  tubing_only_ratings?: string[];
  /** The only materials valid when one of `tubing_only_ratings`
   *  is selected. */
  tubing_only_materials?: string[];
  /** Human-readable hint shown when materials are filtered to the
   *  tubing-only subset. */
  tubing_only_message?: string;
}

export interface PMSOptions {
  pressure_ratings: string[];
  /**
   * Subset of `pressure_ratings` that the backend has marked as
   * temporarily disabled. The dropdown renders them but with the
   * `disabled` attribute set so they're visible-yet-unselectable.
   * Backend owns the list — edit `pressure_ratings.json` →
   * `disabled_ratings` to add/remove. No SPA change needed.
   */
  disabled_pressure_ratings?: string[];
  materials: string[];
  corrosion_allowances: string[];
  services: string[];
  services_allow_custom: boolean;
  /** Server-driven (material, rating) compatibility rule. Optional
   *  for backward compat with older backends that don't ship it. */
  rating_restrictions?: PMSRatingRestrictions;
}

export async function getOptionsAll(): Promise<PMSOptions> {
  const response = await fetch(`${PMS_API_BASE_URL}/options/all`);
  return handleResponse<PMSOptions>(response);
}

// === /api/resolve-class — derive class code + P-T + code factors ===

export interface ResolveClassRequest {
  rating: string;
  material: string;
  corrosion_allowance: string;
  service?: string;
}

export interface PressureTemperaturePayload {
  group?: string;
  temperatures_c?: number[];
  pressures_barg?: number[];
  temp_labels?: string[];
  hydrotest_barg?: number | null;
  cold_point?: { pressure_barg: number; temperature_c: number } | null;
  hottest_point?: { pressure_barg: number; temperature_c: number } | null;
  /**
   * Backend-prepared subset of the curve, filtered for on-screen
   * display in the "Pressure-Temperature Rating" table (currently
   * capped at 300 °C). The full curve in temperatures_c /
   * pressures_barg / temp_labels above is still used for adequacy,
   * interpolation, and the two-way Design P ↔ Design T sync.
   */
  display_columns?: {
    temperatures_c: number[];
    pressures_barg: number[];
    temp_labels: string[];
    cap_c: number;
  };
  pending?: string;
  rating?: string;
}

export interface StressTablePayload {
  key?: string;
  label?: string;
  stress_psi_by_temp_c?: Record<string, number>;
  max_temp_c?: number;
  source_pdf_page?: string | null;
}

export interface YCurvePayload {
  category?: string;
  label?: string;
  temperatures_c?: number[];
  y_values?: number[];
}

export interface FittingSpecsPayload {
  family?: string;
  pipe?: string;
  fittings?: string;
  flange?: string;
  valve_body?: string;
  branch_outlet?: string;
  [k: string]: unknown;
}

/** One valve entry — both the order code (e.g. "BLRPF1J") and the spec sentence. */
export interface FlangeValveEntry {
  code: string;
  desc: string;
}

export interface FlangeExtrasPayload {
  face?: { code: string; label: string };
  type?: { type?: string; compact?: string; hub?: string };
  bolting?: { stud?: string; hex_nut?: string };
  gasket?: { type?: string; spec?: string };
  spectacle?: { moc?: string; small_bore?: string; large_bore?: string };
  valves?: {
    rating?: string;
    body?: string;
    ball?: FlangeValveEntry;
    gate?: FlangeValveEntry;
    globe?: FlangeValveEntry;
    check?: FlangeValveEntry;
    butterfly?: FlangeValveEntry;
    dbb?: FlangeValveEntry;
    dbb_inst?: FlangeValveEntry;
    needle?: FlangeValveEntry;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface BranchChartPayload {
  id?: string;
  title?: string;
  subtitle?: string;
  applies_to?: string[];
  resolved_family?: string;
  /** Both axes — branch chart is square/triangular and shares the NPS list. */
  nps_axis?: number[];
  /** matrix[i] has up to i+1 entries (triangular). Each cell is a fitting
   *  code like "T" (tee), "W" (weldolet), "S" (sockolet), "RT", "H", "-". */
  matrix?: string[][];
  legend?: Record<string, string>;
  [k: string]: unknown;
}

export interface CodeFactorsPayload {
  stress_table?: StressTablePayload | null;
  y_curve?: YCurvePayload | null;
  cold_temp_c?: number | null;
  stress_at_cold?: number | null;
  fitting_specs?: FittingSpecsPayload | null;
  flange_extras?: FlangeExtrasPayload | null;
  branch_chart?: BranchChartPayload | null;
}

export interface ResolveClassResponse {
  class_code: string;
  /**
   * Original §5.5 class code (e.g. "A1") before the customized-zone
   * rename. When the design T is above the standard envelope cap
   * (300 °C), the backend renames `class_code` to "New-spec-[A1]"
   * but keeps the original here so the SPA can detect customization
   * via `class_code !== base_class_code`.
   */
  base_class_code?: string;
  letter: string;
  digit: string;
  suffix: string;
  trailing?: string;
  service: string;
  note: string;
  pressure_temperature: PressureTemperaturePayload | null;
  code_factors: CodeFactorsPayload;
}

export async function resolveClass(req: ResolveClassRequest): Promise<ResolveClassResponse> {
  const response = await fetch(`${PMS_API_BASE_URL}/resolve-class`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return handleResponse<ResolveClassResponse>(response);
}

// === /api/compute-pms — single source of truth for everything the SPA renders ===

export interface ComputePMSRequest {
  rating: string;
  material: string;
  corrosion_allowance: string;
  service?: string;
  design_pressure_barg?: number | null;
  design_temp_c?: number | null;
  mdmt_c?: number | null;
  joint_type?: string;
}

/** Per-NPS row in the Wall Thickness table — computed server-side. */
export interface ComputeWtRow {
  nps: string;
  nps_decimal: number;
  od_mm: number;
  t_mm: number | null;
  d_over_6: number;
  validity: "OK" | "ALERT" | null;
  tm_mm: number | null;
  mill_tol: number;
  calc_thk_mm: number | null;
  sch_display: string | null;
  sel_thk_mm: number | null;
  /** Pre-formatted display string for the SEL. THK column — populated by
   *  the backend ONLY on NOT OK rows, where it echoes the calc thk
   *  rounded UP to 1 decimal place (e.g. 17.382 → "17.4"). OK rows leave
   *  this `null` and the SPA renders the raw `sel_thk_mm` at 2 dp (the
   *  schedule's exact WT). The precision rule lives entirely in
   *  `wt_calc.py`; the SPA just renders it. */
  sel_thk_mm_display?: string | null;
  /** Internal status — "did a stock B36.10M / B36.19M schedule satisfy
   *  the required calc thk?". Drives the SCH '—' blanking and the
   *  rounded-up WT echo on the SPA. NOT the user-facing STATUS column. */
  sch_status: "OK" | "NOT OK" | null;
  /** User-facing STATUS column. Compares the EFFECTIVE displayed SEL.THK
   *  (sel_thk_mm for OK rows, ceil(calc_thk, 0.1) for fallback rows)
   *  against calc_thk. NOT OK fires only when the displayed wall is
   *  genuinely below the required calc thk — custom-fab rounded-up
   *  rows clear the requirement by construction and read OK here. */
  sel_thk_status?: "OK" | "NOT OK" | null;
  mawp_barg: number | null;
  margin_pct: number | null;
}

export interface ComputeWtSummary {
  min_mawp_barg: number | null;
  max_mawp_barg: number | null;
  min_margin_pct: number | null;
  hydrotest_barg: number | null;
  total_nps_sizes: number;
  /** Project-policy constants surfaced by the backend so the SPA
   *  doesn't have to hardcode them. Mill tolerance is ASME B36.10M
   *  seamless (0.125), hydrotest factor B31.3 §345 (1.5), operating
   *  estimate factor is the 80% rule of thumb (0.8). */
  mill_tolerance?: number;
  hydrotest_factor?: number;
  operating_factor?: number;
}

export interface ComputeFlag {
  level: "critical" | "mandatory" | "warning" | "note";
  title: string;
  body: string;
}

export interface ComputeFormulaCase {
  label: string;
  P_psig: number | null;
  S_psi: number | null;
  t_press_in: number | null;
  governs: boolean;
}

export interface ComputeFormulaExample {
  available: boolean;
  nps: string;
  od_in: number;
  od_mm: number;
  E: number;
  W: number | null;
  Y: number;
  Y_label: string;
  C_mm: number;
  C_in: number;
  mill_tolerance: number;
  case_1?: ComputeFormulaCase;
  case_2?: ComputeFormulaCase;
  governing_case?: 1 | 2;
  t_press_in?: number | null;
  tm_in?: number | null;
  T_req_in?: number | null;
  T_req_mm?: number | null;
  reason?: string;
}

export interface ComputeMaterialsRow {
  component: string;
  material: string;
  schedule: string;
  standard: string;
}

export interface ComputeMaterialsBore {
  range: string;
  connection: string;
  schedule: string;
  rows: ComputeMaterialsRow[];
}

export interface ComputeMaterialsTab {
  small_bore: ComputeMaterialsBore;
  large_bore: ComputeMaterialsBore;
}

export interface ComputeAdequacy {
  adequate: boolean;
  rated_pressure_at_design_t_barg: number;
  design_pressure_barg: number;
  design_temp_c: number;
}

export interface ComputeDerivedConditions {
  pressure: {
    design_barg: number | null;
    design_psig: number | null;
    hydrotest_barg: number | null;
    hydrotest_psig: number | null;
    operating_estimate_barg: number | null;
    operating_estimate_psig: number | null;
  };
  temperature: {
    design_c: number | null;
    design_f: number | null;
    operating_estimate_c: number | null;
    operating_estimate_f: number | null;
    mdmt_c: number | null;
    mdmt_f: number | null;
  };
}

/**
 * Schema descriptor for a single field in the Design Conditions panel.
 * The backend declares which inputs the SPA renders — the SPA just
 * iterates this list. To add / remove / reorder a field, edit
 * `_build_design_conditions_inputs` in pms_snapshot.py. No SPA change.
 */
export interface DesignConditionInput {
  /** Key matching a field in design_conditions / effective_design_conditions. */
  field: string;
  label: string;
  type: "number" | "select";
  step?: number;
  min?: number;
  max?: number;
  required?: boolean;
  /** Pre-formatted footnote ("= 572.0 °F"). Null = no footnote. */
  footnote_text?: string | null;
  /** Only for type:"select" — backend-supplied dropdown options. */
  options?: Array<{ value: string; label: string }>;
  /** Layout hint for the SPA's 2-column CSS grid: 1 = half, 2 = full. */
  col_span?: 1 | 2;
  /**
   * Field-id of a partner that should be cleared when this field is
   * edited. Drives two-way curve sync: clearing the partner lets the
   * backend interpolate its value from the P-T curve on the next
   * compute call. Set on Design P (partner = Design T) and vice-versa.
   */
  sync_partner?: string;
}

export interface ComputePMSResponse extends ResolveClassResponse {
  design_conditions: {
    design_pressure_barg: number | null;
    design_temp_c: number | null;
    mdmt_c: number | null;
    joint_type: string | null;
  };
  effective_design_conditions: {
    design_pressure_barg: number | null;
    design_temp_c: number | null;
    mdmt_c: number | null;
    joint_type: string | null;
  };
  /** Form schema for Section 2 — declared by the backend. */
  design_conditions_inputs: DesignConditionInput[];
  adequacy: ComputeAdequacy | null;
  derived_conditions: ComputeDerivedConditions;
  wall_thickness: {
    rows: ComputeWtRow[];
    summary: ComputeWtSummary;
    flags: ComputeFlag[];
    formula_example: ComputeFormulaExample | null;
    /**
     * True when the WT calc couldn't produce a result at this design
     * point — typically because the ASME B31.3 Table A-1 stress curve
     * doesn't extend to design_t_c, or the W-factor isn't defined for
     * the joint type at that T. When true, the SPA should hide the
     * empty WT table / summary / formula card and render
     * `unavailable_reason` as a single clear error block.
     */
    unavailable?: boolean;
    unavailable_reason?: string | null;
  };
  materials_tab: ComputeMaterialsTab | null;
  /**
   * Project standard NOTES (the numbered list that appears at the
   * bottom of the PMS Excel datasheet). Backend-filtered from
   * `app/data/pms_notes.json` based on this PMS's rating / material
   * / service / design T. Edit the JSON file to change the
   * note list — no SPA code change required.
   */
  project_notes?: Array<{ id: number; text: string }>;
}

export async function computePMS(req: ComputePMSRequest): Promise<ComputePMSResponse> {
  const response = await fetch(`${PMS_API_BASE_URL}/compute-pms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return handleResponse<ComputePMSResponse>(response);
}

// === /api/export/excel + /api/export/pdf — engineer-driven exports ===
//
// Both endpoints accept the identical request shape and return a binary
// blob (Excel or PDF) of the same datasheet. The PDF endpoint produces
// the .xlsx server-side and converts it via LibreOffice headless mode —
// so the PDF is visually identical to the Excel layout. If LibreOffice
// isn't installed on the deployment server, the PDF call returns 503
// with a clear install hint (this is surfaced verbatim via `detail`).

export interface ExportExcelRequest {
  rating: string;
  material: string;
  ca: string;
  service?: string;
  design_p_barg: number;
  design_t_c: number;
  mdmt_c?: number;
  joint_type?: string;
}

/** Internal shared fetch helper for the export endpoints — both have
 *  the same request shape, same auth-free error model, and both return
 *  a Blob. Only the URL path and Content-Type differ. */
async function _downloadExportBlob(
  path: "/export/excel" | "/export/pdf",
  req: ExportExcelRequest,
): Promise<Blob> {
  const response = await fetch(`${PMS_API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      detail = errorData.detail || detail;
    } catch {
      const text = await response.text().catch(() => "");
      detail = text || detail;
    }
    throw new PMSApiError(response.status, detail);
  }
  return response.blob();
}

export async function exportExcel(req: ExportExcelRequest): Promise<Blob> {
  return _downloadExportBlob("/export/excel", req);
}

export async function exportPDF(req: ExportExcelRequest): Promise<Blob> {
  return _downloadExportBlob("/export/pdf", req);
}

// === /api/ai/status + /api/ai/pms-notes — AI engineering notes ===

export interface AiStatus {
  available: boolean;
}

export async function getAiStatus(): Promise<AiStatus> {
  const response = await fetch(`${PMS_API_BASE_URL}/ai/status`);
  return handleResponse<AiStatus>(response);
}

export interface PMSNotesRequest {
  class_code: string;
  rating: string;
  material: string;
  ca: string;
  service?: string;
  design_p_barg?: number | null;
  design_t_c?: number | null;
  mdmt_c?: number | null;
  joint_type?: string;
  stress_table_label?: string;
  fitting_family?: string;
}

export interface PMSNote {
  title: string;
  body: string;
  category: string;
}

export interface PMSNotesResponse {
  ok: boolean;
  notes?: PMSNote[];
  model?: string;
  usage?: Record<string, number | null>;
  error?: string;
}

export async function generatePMSNotes(req: PMSNotesRequest): Promise<PMSNotesResponse> {
  const response = await fetch(`${PMS_API_BASE_URL}/ai/pms-notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return handleResponse<PMSNotesResponse>(response);
}

const pmsApi = {
  // AI Agent
  chatWithPMSAgent,
  downloadPMSExcel,
  downloadBulkPMSZip,
  savePMS,
  // Configurator
  getOptionsAll,
  resolveClass,
  computePMS,
  exportExcel,
  exportPDF,
  getAiStatus,
  generatePMSNotes,
};

export default pmsApi;
