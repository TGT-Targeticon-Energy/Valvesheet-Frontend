/**
 * PMSGeneratorPage — Generate-PMS configurator (thin render layer).
 *
 * Architecture: every value rendered on this page comes from a single
 * backend call. The page does ZERO engineering math itself — no B31.3
 * Eq. 3a, no stress / Y interpolation, no schedule picking, no
 * adequacy check, no derived design conditions. Every formula lives
 * in `pms-generator-new` and is exposed through `POST /api/compute-pms`.
 *
 * Endpoints:
 *   GET  /api/options/all     — dropdown lists (loaded once on mount)
 *   POST /api/compute-pms     — full snapshot for current inputs (debounced)
 *   POST /api/export/excel    — download Excel
 *   POST /api/export/pdf      — download PDF
 *   POST /api/pms-agent/save  — persist to saved_pms (Save PMS button)
 *
 * Re-render flow:
 *   1. User changes any input (rating / material / CA / service /
 *      design P, T, MDMT / joint type)
 *   2. Effect debounces 350 ms, posts to /api/compute-pms
 *   3. Response replaces the entire computed-state object
 *   4. All tabs render directly from response.* — no derivation
 *
 * Backend changes propagate to this page automatically — there is
 * nothing to keep in sync.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileSpreadsheet,
  Loader2,
  Download,
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import pmsApi, {
  PMSOptions,
  ComputePMSResponse,
  ComputeWtRow,
  ComputeFlag,
  ComputeMaterialsBore,
  PMSApiError,
  SavePMSExistingMeta,
  SavePMSRequest,
} from "@/services/pmsApi";
import { pmsWorkflowApi, projectApi, type ProjectMasterEntry } from "@/services/pmsWorkflowApi";
import { ServiceMultiSelect } from "@/pages/pmsWorkflow/shared";

export type JointType = "Seamless" | "EFW, 100% RT" | "ERW" | "EFW";

export const JOINT_TYPES: { value: JointType; label: string; e: number }[] = [
  { value: "Seamless", label: "Seamless (E = 1.0)", e: 1.0 },
  { value: "EFW, 100% RT", label: "EFW, 100% RT (E = 1.0)", e: 1.0 },
  { value: "ERW", label: "ERW (E = 0.85)", e: 0.85 },
  { value: "EFW", label: "EFW (E = 0.85)", e: 0.85 },
];

const BARG_TO_PSIG = 14.5038;
const fmt = (n: number | null | undefined, digits = 1) =>
  n == null || Number.isNaN(n) ? "—" : Number(n).toFixed(digits);
/**
 * Format a pressure (barg) for display in the P-T Rating table.
 *
 * Rounds to 2 decimal places and strips trailing zeros, so:
 *   20.00 → "20"     (B16.5 clean ratings stay tidy)
 *   19.60 → "19.6"   (standard 1-dp values unchanged)
 *   16.32 → "16.32"  (BONSTRAND 50000C values keep full precision)
 *
 * Mirrors the backend's `_ds_fmt(p, 2)` in excel_exporter.py so the
 * on-screen P-T table matches the downloaded Excel/PDF cell-for-cell.
 * Without this, the SPA truncates 16.32 → "16.3" while Excel shows
 * "16.32" — a divergence the user has flagged before.
 */
const fmtP = (n: number | null | undefined) =>
  n == null || Number.isNaN(n)
    ? "—"
    : Number(n).toFixed(2).replace(/\.?0+$/, "") || "0";
const fmtNum = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n)
    ? "—"
    : Number(n).toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
const cleanMaterial = (m: string) => m.replace(/\s*\(.*?\)\s*/g, "").trim();

// Local card wrapper — keeps a consistent visual treatment for sections.
function Card({
  title,
  className = "",
  children,
}: {
  title?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        "rounded-lg border border-border bg-card shadow-sm overflow-hidden " +
        className
      }
    >
      {title && (
        <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
          {title}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

const triggerBrowserDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export default function PMSGeneratorPage() {
  const navigate = useNavigate();

  // ── Projects ────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<ProjectMasterEntry[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");

  useEffect(() => {
    projectApi.listProjects().then(setProjects).catch(() => {});
  }, []);

  // ── Catalogue ──────────────────────────────────────────────────────
  const [options, setOptions] = useState<PMSOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // ── Identification form ─────────────────────────────────────────────
  const [rating, setRating] = useState("");
  const [material, setMaterial] = useState("");
  const [ca, setCa] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [customService, setCustomService] = useState("");
  const service = useMemo(() => {
    const picks = [...selectedServices];
    if (customService.trim()) picks.push(customService.trim());
    return picks.join(", ");
  }, [selectedServices, customService]);

  // ── Design conditions ───────────────────────────────────────────────
  //
  // Design P and Design T are INDEPENDENT after the first compute
  // response for a given class. On initial mount (or whenever the
  // identification quad — rating / material / CA / service — changes)
  // both fields are cleared and the backend's
  // `effective_design_conditions` is seeded ONCE into state. That
  // gives the engineer a sensible starting P/T pair from the curve.
  // After that one-shot seed, editing or clearing one field never
  // touches the other; the `sync_partner` hint from the backend is
  // intentionally ignored on the SPA side.
  const [designP, setDesignP] = useState<string>("");
  const [designT, setDesignT] = useState<string>("");
  const [mdmt, setMdmt] = useState<string>("-29");
  const [jointType, setJointType] = useState<JointType>("Seamless");
  // Tracks which class the design-condition defaults were last seeded
  // for. Implemented as a ref (not state) so reads inside the debounce
  // setTimeout always see the LATEST value — useState here suffers a
  // closure-capture race when the user changes class while a compute
  // is in flight, leaving the seed gated permanently. The ref-key gate
  // fires exactly once per (rating, material, ca, service) combo.
  const lastSeededKeyRef = useRef<string>("");

  // ── Computed snapshot from backend ──────────────────────────────────
  const [computed, setComputed] = useState<ComputePMSResponse | null>(null);
  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);

  // ── Excel/PDF download + Save ───────────────────────────────────────
  const [downloading, setDownloading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [overwritePrompt, setOverwritePrompt] = useState<{
    payload: SavePMSRequest;
    existing: SavePMSExistingMeta;
    label: string;
  } | null>(null);

  // ── Bootstrap: load dropdowns ──────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await pmsApi.getOptionsAll();
        setOptions(data);
      } catch (err) {
        const msg =
          err instanceof PMSApiError ? err.detail : (err as Error).message;
        setOptionsError(msg);
      }
    })();
  }, []);

  // ── Reset on class change ──────────────────────────────────────────
  // Clear designP/designT when the identification quad changes so the
  // next compute response can populate them fresh from
  // `effective_design_conditions`. The ref-key gate in the compute
  // effect detects the new class and fires the one-shot seed.
  useEffect(() => {
    setSaved(false);
    setDesignP("");
    setDesignT("");
  }, [rating, material, ca, service]);

  // ── Debounced compute call — single network round-trip for every
  //    input change. The response is the entire renderable state. ────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!rating || !material || !ca || !service) {
      setComputed(null);
      setComputeError(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setComputing(true);
      setComputeError(null);
      try {
        const designP_n = parseFloat(designP);
        const designT_n = parseFloat(designT);
        const mdmt_n = parseFloat(mdmt);
        const r = await pmsApi.computePMS({
          rating,
          material,
          corrosion_allowance: ca,
          service,
          design_pressure_barg: Number.isFinite(designP_n) ? designP_n : null,
          design_temp_c:        Number.isFinite(designT_n) ? designT_n : null,
          mdmt_c:               Number.isFinite(mdmt_n)    ? mdmt_n    : null,
          joint_type:           jointType,
        });
        setComputed(r);

        // One-shot seed of design-condition defaults from the backend
        // response. Fires exactly once per (rating, material, ca,
        // service) combo — the ref-key gate compares the current quad
        // against the last quad we seeded for. Once seeded, repeat
        // computes for the same class skip the block, so editing or
        // clearing one field never re-populates the other. Changing
        // the class flips the key, clears designP/designT in the
        // reset effect above, and re-seeds with the new curve's max.
        //
        // Refs (not state) are used here on purpose: the setTimeout
        // closure reads `lastSeededKeyRef.current` LIVE, which avoids
        // the closure-capture race that a useState guard suffers when
        // the user changes class while a compute is in flight.
        const seedKey = `${rating}|${material}|${ca}|${service}`;
        if (lastSeededKeyRef.current !== seedKey) {
          const eff = r.effective_design_conditions;
          if (eff.design_pressure_barg != null) {
            setDesignP(String(eff.design_pressure_barg));
          }
          if (eff.design_temp_c != null) {
            setDesignT(String(eff.design_temp_c));
          }
          if (eff.mdmt_c != null && !mdmt) {
            setMdmt(String(eff.mdmt_c));
          }
          if (eff.joint_type && !jointType) {
            setJointType(eff.joint_type as JointType);
          }
          lastSeededKeyRef.current = seedKey;
        }
      } catch (err) {
        const msg =
          err instanceof PMSApiError ? err.detail : (err as Error).message;
        setComputeError(msg);
        setComputed(null);
      } finally {
        setComputing(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rating, material, ca, service, designP, designT, mdmt, jointType]);

  // ── Derived numerics for the input row ─────────────────────────────
  const designPnum = parseFloat(designP);
  const designTnum = parseFloat(designT);
  const mdmtNum = parseFloat(mdmt);
  const designConditionsValid =
    Number.isFinite(designPnum) && designPnum > 0 && Number.isFinite(designTnum);

  // ── Handlers ───────────────────────────────────────────────────────
  const toggleService = (svc: string, checked: boolean) => {
    setSelectedServices((prev) =>
      checked ? [...prev, svc] : prev.filter((s) => s !== svc),
    );
  };

  /**
   * Shared download flow for Excel and PDF — both endpoints accept the
   * same request shape, return a Blob, and use the same error envelope.
   * Only the API call, file extension, and toast label differ. Adding
   * any future export format (DOCX, etc.) is a one-liner here.
   */
  const _runDatasheetDownload = async (
    fmt: "xlsx" | "pdf",
  ) => {
    if (!computed || !designConditionsValid) return;
    setDownloading(true);
    try {
      const apiCall = fmt === "pdf" ? pmsApi.exportPDF : pmsApi.exportExcel;
      const blob = await apiCall({
        rating,
        material,
        ca,
        service,
        design_p_barg: designPnum,
        design_t_c: designTnum,
        mdmt_c: Number.isFinite(mdmtNum) ? mdmtNum : -29,
        joint_type: jointType,
      });
      const fname = `PMS_${computed.class_code}_${rating.replace(/[^A-Za-z0-9]/g, "")}.${fmt}`;
      triggerBrowserDownload(blob, fname);
      toast.success(`Downloaded ${fname}`);
    } catch (err) {
      const msg =
        err instanceof PMSApiError ? err.detail : (err as Error).message;
      toast.error(`Export failed: ${msg}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownload    = () => _runDatasheetDownload("xlsx");
  const handleDownloadPdf = () => _runDatasheetDownload("pdf");

  const buildSavePayload = (force = false): SavePMSRequest | null => {
    if (!computed) return null;
    return {
      piping_class: computed.class_code,
      rating,
      material,
      corrosion_allowance: ca,
      service,
      design_pressure_barg: Number.isFinite(designPnum) ? designPnum : null,
      design_temp_c: Number.isFinite(designTnum) ? designTnum : null,
      mdmt_c: Number.isFinite(mdmtNum) ? mdmtNum : null,
      joint_type: jointType,
      force,
    };
  };

  const _createWorkflowAfterSave = async (savePayload: SavePMSRequest) => {
    if (!selectedProject) return;
    try {
      const wf = await pmsWorkflowApi.createWorkflow({
        project_id: selectedProject,
        piping_class: savePayload.piping_class,
        rating: savePayload.rating,
        material: savePayload.material,
        corrosion_allowance: savePayload.corrosion_allowance,
        service: savePayload.service || "",
        design_pressure_barg: savePayload.design_pressure_barg ?? undefined,
        design_temp_c: savePayload.design_temp_c ?? undefined,
        mdmt_c: savePayload.mdmt_c ?? undefined,
        joint_type: savePayload.joint_type,
      });
      toast.success(`Workflow created — ${savePayload.piping_class}`);
      navigate(`/pms-workflow/${wf.workflow_id}`);
    } catch (err: any) {
      // Workflow already exists for this project+class — navigate to the list
      toast.info("A workflow already exists for this class in the selected project.");
      navigate("/pms-workflow");
    }
  };

  const handleSave = async () => {
    const payload = buildSavePayload(false);
    if (!payload || saving) return;
    if (!selectedProject) {
      toast.error("Please select a project before saving.");
      return;
    }
    setSaving(true);
    try {
      const outcome = await pmsApi.savePMS(payload);
      if (outcome.kind === "conflict") {
        setOverwritePrompt({
          payload,
          existing: outcome.existing,
          label: `${payload.piping_class} · ${payload.rating} · ${payload.material} · CA ${payload.corrosion_allowance}`,
        });
        return;
      }
      setSaved(true);
      await _createWorkflowAfterSave(payload);
    } catch (err) {
      const msg =
        err instanceof PMSApiError ? err.detail : (err as Error).message;
      toast.error(`Save failed: ${msg}`);
    } finally {
      if (!overwritePrompt) setSaving(false);
    }
  };

  const performForceSave = async () => {
    if (!overwritePrompt) return;
    const payload = { ...overwritePrompt.payload, force: true };
    setOverwritePrompt(null);
    try {
      const outcome = await pmsApi.savePMS(payload);
      if (outcome.kind === "saved") {
        setSaved(true);
        await _createWorkflowAfterSave(payload);
      } else {
        toast.error("Save failed unexpectedly");
      }
    } catch (err) {
      const msg =
        err instanceof PMSApiError ? err.detail : (err as Error).message;
      toast.error(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 px-4 py-4">
        {/* ============================================================
            SIDEBAR — identification + design conditions + download + save
            ============================================================ */}
        <aside className="space-y-4">
          {/* ── Project Selector ── */}
          <Card title={<SectionTitle num={0} label="Project" />}>
            <div className="space-y-1">
              <Label htmlFor="project-select">Select Project *</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger id="project-select" className="mt-1">
                  <SelectValue placeholder="Select a project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.project_id} value={p.project_id}>
                      {p.project_name} ({p.project_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedProject && (
                <p className="text-[11px] text-amber-600 mt-1">
                  A project must be selected to start a workflow.
                </p>
              )}
            </div>
          </Card>

          {/* ── Section 1 · PMS Identification ── */}
          <Card title={<SectionTitle num={1} label="PMS Identification" />}>
            <div className="space-y-3">
              {optionsError && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                  Couldn't load dropdown lists: {optionsError}
                </div>
              )}
              {/*
                Backend-driven (material, rating) compatibility.
                `options.rating_restrictions` is computed by
                /api/options/all from class_naming.json — see
                PMSRatingRestrictions in pmsApi.ts. The SPA only
                reads it and disables incompatible options; the
                actual rule lives entirely on the server.
              */}
              {(() => {
                const rr = options?.rating_restrictions;
                // Rule 1 — exotic materials → low-pressure ratings only
                const restrictedMaterials = new Set(rr?.restricted_materials ?? []);
                const allowedRatings      = new Set(rr?.allowed_ratings ?? []);
                const materialIsRestricted    = !!material && restrictedMaterials.has(material);
                const ratingOutsideAllowed    = !!rating   && !allowedRatings.has(rating);
                // Rule 2 — Tubing ratings → instrument-tubing materials only
                //
                // FALLBACK PATH: when the backend hasn't been updated to
                // include `tubing_only_ratings` / `tubing_only_materials`
                // yet, derive them from name patterns so the rule still
                // works. Ratings starting with "Tubing " are the
                // instrument-tubing series; materials matching /Tubing/i
                // are the corresponding tubing materials (per the
                // "Instrument Tubing" category in materials.json). The
                // backend fields take precedence whenever they're
                // present — this is purely a defensive default.
                const fallbackTubingRatings   = (options?.pressure_ratings ?? []).filter((r) => /^Tubing\s/i.test(r));
                const fallbackTubingMaterials = (options?.materials ?? []).filter((m) => /Tubing/i.test(m));
                const tubingOnlyRatings   = new Set(rr?.tubing_only_ratings   ?? fallbackTubingRatings);
                const tubingOnlyMaterials = new Set(rr?.tubing_only_materials ?? fallbackTubingMaterials);
                const tubingOnlyMessage   = rr?.tubing_only_message
                  ?? `${[...tubingOnlyRatings].join(", ")} are instrument-tubing series — only tubing materials apply (${[...tubingOnlyMaterials].join(", ")}).`;
                const ratingIsTubing      = !!rating   && tubingOnlyRatings.has(rating);
                const materialIsNonTubing = !!material && tubingOnlyRatings.size > 0
                                            && !tubingOnlyMaterials.has(material);
                const showRatingHint   = materialIsRestricted
                                         || (materialIsNonTubing && tubingOnlyRatings.size > 0);
                const showMaterialHint = (ratingOutsideAllowed && restrictedMaterials.size > 0)
                                         || ratingIsTubing;
                return (
                  <>
                    <div>
                      <Label htmlFor="rating">Pressure Rating *</Label>
                      <Select value={rating} onValueChange={setRating}>
                        <SelectTrigger id="rating" className="mt-1">
                          <SelectValue placeholder="Select Rating" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Three disable sources, all backend-driven:
                              1. `disabled_pressure_ratings` — permanently
                                 unavailable ratings (5000# / 10000#).
                              2. `rating_restrictions.allowed_ratings` —
                                 disable ratings incompatible with the
                                 currently selected exotic material.
                              3. `rating_restrictions.tubing_only_ratings` —
                                 if user picked a non-tubing material,
                                 disable the Tubing A/B/C series. */}
                          {options?.pressure_ratings.map((r) => {
                            const permanentlyOff = (options.disabled_pressure_ratings ?? []).includes(r);
                            const incompatExotic = materialIsRestricted && !allowedRatings.has(r);
                            const incompatTubing = materialIsNonTubing && tubingOnlyRatings.has(r);
                            const incompatible   = incompatExotic || incompatTubing;
                            const isDisabled     = permanentlyOff || incompatible;
                            const label =
                              permanentlyOff ? `${r} (disabled)` :
                              incompatible   ? `${r} (not valid for ${material})` :
                              r;
                            return (
                              <SelectItem key={r} value={r} disabled={isDisabled}>
                                {label}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {showRatingHint && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {materialIsRestricted ? rr?.message : tubingOnlyMessage}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="material">Material *</Label>
                      <Select value={material} onValueChange={setMaterial}>
                        <SelectTrigger id="material" className="mt-1">
                          <SelectValue placeholder="Select Material" />
                        </SelectTrigger>
                        <SelectContent>
                          {options?.materials.map((m) => {
                            // Two disable cases (mirror of the rating
                            // dropdown's incompatibility logic):
                            //   • exotic material × non-allowed rating
                            //   • non-tubing material × Tubing-series rating
                            const incompatExotic = ratingOutsideAllowed && restrictedMaterials.has(m);
                            const incompatTubing = ratingIsTubing && !tubingOnlyMaterials.has(m);
                            const incompatible   = incompatExotic || incompatTubing;
                            const label = incompatible
                              ? `${m} (not valid for ${rating})`
                              : m;
                            return (
                              <SelectItem key={m} value={m} disabled={incompatible}>
                                {label}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {showMaterialHint && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {ratingIsTubing
                            ? tubingOnlyMessage
                            : `Some materials are hidden — ${rr?.message?.toLowerCase() ?? ""}`}
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}
              <div>
                <Label htmlFor="ca">Corrosion Allowance *</Label>
                <Select value={ca} onValueChange={setCa}>
                  <SelectTrigger id="ca" className="mt-1">
                    <SelectValue placeholder="Select C.A." />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.corrosion_allowances.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Service Description *</Label>
                <ServiceMultiSelect
                  options={options?.services ?? []}
                  allowCustom={options?.services_allow_custom ?? false}
                  selected={selectedServices}
                  custom={customService}
                  onToggle={toggleService}
                  onCustomChange={setCustomService}
                />
              </div>
            </div>
          </Card>

          {/* ── Live class-code preview ── */}
          {computing && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 flex items-center gap-2 text-sm text-amber-800">
              <Loader2 className="w-4 h-4 animate-spin" />
              Computing…
            </div>
          )}
          {computeError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              {computeError}
            </div>
          )}
          {computed && (
            <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-3">
              <div className="text-[11px] text-green-800 uppercase tracking-wide font-semibold">
                Resolved §5.5 PMS Code
              </div>
              <div className="text-2xl font-bold text-green-900 mt-0.5">
                {computed.class_code}
              </div>
              <div className="text-xs text-green-800 mt-1">{computed.note}</div>
            </div>
          )}

          {/* Customized-PMS banner — fires whenever the backend renamed
              the class (T > 300 °C zone). Reads `class_code` vs
              `base_class_code` to detect, so the SPA carries no
              threshold value of its own. */}
          {computed &&
            computed.base_class_code &&
            computed.class_code !== computed.base_class_code && (
              <div className="rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-3 space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
                  <div className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                    Customized PMS — Engineering Review Required
                  </div>
                </div>
                <div className="text-[13px] text-amber-900 leading-snug">
                  This PMS is a non-standard variant of{" "}
                  <strong>{computed.base_class_code}</strong> (design
                  temperature outside the standard 0–300 °C envelope).
                  Wall-thickness uses the design point only (no cold-end
                  envelope check). Please consult a technical engineer to
                  verify suitability before issuing this report.
                </div>
              </div>
            )}

          {/* ── Section 2 · Design Conditions ──
              Pure renderer driven by `computed.design_conditions_inputs`.
              The backend's `_build_design_conditions_inputs` decides
              which fields appear, their labels, types, dropdown options,
              layout widths, validation rules, and footnote text. To
              add / remove / rename / reorder a field, edit
              pms_snapshot.py in pms-generator-new. No SPA change. */}
          {computed && (
            <Card title={<SectionTitle num={2} label="Design Conditions" />}>
              <div className="grid grid-cols-2 gap-2">
                {computed.design_conditions_inputs.map((inp) => {
                  // Map each backend-declared field id to its SPA state cell.
                  // The labels / types / widths / options come from the schema.
                  const getValue = (): string => {
                    switch (inp.field) {
                      case "design_pressure_barg": return designP;
                      case "design_temp_c":        return designT;
                      case "mdmt_c":               return mdmt;
                      case "joint_type":           return jointType;
                      default:                     return "";
                    }
                  };
                  const writeField = (field: string, v: string) => {
                    switch (field) {
                      case "design_pressure_barg": setDesignP(v); break;
                      case "design_temp_c":        setDesignT(v); break;
                      case "mdmt_c":               setMdmt(v); break;
                      case "joint_type":           setJointType(v as JointType); break;
                    }
                  };
                  const setValue = (v: string) => {
                    writeField(inp.field, v);
                    // Two-way P↔T sync intentionally disabled: Design P
                    // and Design T are independent after the initial
                    // one-shot seed. The backend's `sync_partner` hint
                    // is ignored on purpose so editing one field never
                    // wipes the other.
                  };
                  const colSpanClass =
                    (inp.col_span ?? 1) === 2 ? "col-span-2" : "col-span-1";
                  const labelText = inp.label + (inp.required ? " *" : "");

                  return (
                    <div key={inp.field} className={colSpanClass}>
                      <Label htmlFor={inp.field}>{labelText}</Label>
                      {inp.type === "select" ? (
                        <Select value={getValue()} onValueChange={setValue}>
                          <SelectTrigger id={inp.field} className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(inp.options ?? []).map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={inp.field}
                          type="number"
                          step={inp.step}
                          min={inp.min}
                          max={inp.max}
                          value={getValue()}
                          onChange={(e) => setValue(e.target.value)}
                          className="mt-1"
                        />
                      )}
                      {inp.footnote_text && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {inp.footnote_text}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* ── Download Excel + PDF + Save ── */}
          {computed && (
            <div className="space-y-2">
              <Button
                size="lg"
                className="w-full"
                disabled={!designConditionsValid || downloading}
                onClick={handleDownload}
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Download Excel
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                disabled={!designConditionsValid || downloading}
                onClick={handleDownloadPdf}
                title="Download the same datasheet as a PDF (rendered server-side from the Excel)"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Download PDF
              </Button>
              <Button
                size="lg"
                variant={saved ? "secondary" : "outline"}
                className={
                  // Lock the emerald palette on hover too — shadcn's
                  // default `variant="outline"` adds `hover:bg-accent
                  // hover:text-accent-foreground`, and `variant="secondary"`
                  // adds `hover:bg-secondary/80`. Both override our
                  // custom colours on hover, turning the button grey
                  // for an instant. The explicit `hover:text-emerald-*`
                  // and `hover:bg-emerald-*` below win because they
                  // sit later in the className (tailwind-merge keeps
                  // the trailing utility).
                  "w-full " +
                  (saved
                    ? "bg-emerald-100 text-emerald-800 border-emerald-200 " +
                      "hover:bg-emerald-200 hover:text-emerald-900 hover:border-emerald-300"
                    : "bg-white text-emerald-700 border-emerald-200 " +
                      "hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300")
                }
                disabled={saving || !selectedProject}
                onClick={handleSave}
                title={
                  !selectedProject
                    ? "Select a project first"
                    : saved
                    ? "Already saved — click to overwrite and re-create workflow"
                    : "Save this PMS and start a workflow"
                }
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : saved ? (
                  <BookmarkCheck className="w-4 h-4 mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {saving ? "Creating workflow…" : saved ? "Saved" : "Save & Start Workflow"}
              </Button>
              {/* Push to Valvesheet AI button removed per request —
                  the PMS Generator page no longer pushes to the agent.
                  If re-enabling, restore the handler, state hooks, and
                  syncPmsFromGenerator import (git history). */}
            </div>
          )}
        </aside>

        {/* ============================================================
            MAIN — empty state or tabbed report
            ============================================================ */}
        <main>
          {!computed ? (
            <EmptyState />
          ) : (
            <ReportPanel
              computed={computed}
              rating={rating}
              material={material}
              ca={ca}
              service={service}
              jointType={jointType}
            />
          )}
        </main>
      </div>

      {/* Overwrite-confirm modal */}
      <AlertDialog
        open={!!overwritePrompt}
        onOpenChange={(open) => {
          if (!open) {
            setOverwritePrompt(null);
            setSaving(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This PMS is already saved</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  <strong>{overwritePrompt?.label}</strong>
                </div>
                {overwritePrompt?.existing.updated_at && (
                  <div className="text-muted-foreground">
                    Last saved on{" "}
                    {new Date(
                      overwritePrompt.existing.updated_at * 1000,
                    ).toLocaleString()}
                  </div>
                )}
                <div>
                  Saving again will <strong>overwrite</strong> the previously
                  stored payload and design conditions. Continue?
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performForceSave}>
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ====================================================================
// Sidebar widgets
// ====================================================================

function SectionTitle({ num, label }: { num: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-600 text-white text-[11px]">
        {num}
      </span>
      {label}
    </span>
  );
}


// ====================================================================
// Empty state
// ====================================================================

function EmptyState() {
  return (
    <Card>
      <div className="flex flex-col items-center justify-center text-center py-20">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-purple-50 mb-4">
          <FileSpreadsheet className="w-10 h-10 text-amber-600" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Configure your piping class</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Select a Pressure Rating, Material, Corrosion Allowance, and Service in
          the sidebar to begin. The PMS report will populate automatically.
        </p>
      </div>
    </Card>
  );
}

// ====================================================================
// ReportPanel — pure render layer over the compute response
// ====================================================================

export interface ReportPanelProps {
  computed: ComputePMSResponse;
  rating: string;
  material: string;
  ca: string;
  service: string;
  jointType: JointType;
}

export function ReportPanel({
  computed,
  rating,
  material,
  ca,
  service,
  jointType,
}: ReportPanelProps) {
  const services = service
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // The backend marks customized PMS by setting class_code to
  // "New-spec-[base]" and keeping the original in base_class_code.
  // When they differ, an engineering-review warning needs to appear.
  const isCustomized =
    !!computed.base_class_code &&
    computed.class_code !== computed.base_class_code;

  return (
    <div className="space-y-4">
      {/* ── Banner ── */}
      <Card className="bg-gradient-to-r from-amber-600 to-purple-600 text-white border-0">
        <div className="text-[11px] uppercase tracking-wide opacity-80">
          Resolved §5.5 PMS Code
        </div>
        <div className="text-3xl font-bold mt-1">{computed.class_code}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="secondary">{rating}</Badge>
          <Badge variant="secondary">{cleanMaterial(material)}</Badge>
          <Badge variant="secondary">{ca}</Badge>
          {services.map((s) => (
            <Badge key={s} variant="secondary">
              {s}
            </Badge>
          ))}
        </div>
        <div className="text-[11px] opacity-80 mt-2">PMS-{computed.class_code}</div>
      </Card>

      {/* Customized-PMS engineering-review banner — fires whenever the
          backend renamed the class. Decision lives in the backend; the
          SPA just compares class_code to base_class_code. */}
      {isCustomized && (
        <Card className="bg-amber-50 border-2 border-amber-400">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-amber-900">
                Customized PMS — Engineering Review Required
              </div>
              <div className="text-[13px] text-amber-900 leading-snug">
                This PMS is a non-standard variant of{" "}
                <strong>{computed.base_class_code}</strong> — the design
                temperature is outside the standard 0–300&nbsp;°C
                envelope. The wall-thickness calc uses your single
                design point only (no cold-end envelope check). Please
                consult a technical engineer to verify suitability for
                sustained service before issuing this report.
              </div>
            </div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="pt" className="w-full">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="pt">1 · P-T Rating</TabsTrigger>
          <TabsTrigger value="schedule">2 · Schedule & WT</TabsTrigger>
          <TabsTrigger value="materials">3 · Materials</TabsTrigger>
          <TabsTrigger value="components">4 · Components &amp; Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="pt" className="mt-4">
          <PtRatingTab
            computed={computed}
            rating={rating}
            material={material}
          />
        </TabsContent>
        <TabsContent value="schedule" className="mt-4">
          <ScheduleTab
            computed={computed}
            rating={rating}
            material={material}
            ca={ca}
            service={service}
            jointType={jointType}
          />
        </TabsContent>
        <TabsContent value="materials" className="mt-4">
          <MaterialsTab computed={computed} material={material} />
        </TabsContent>
        <TabsContent value="components" className="mt-4">
          <ComponentsTab computed={computed} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ====================================================================
// Tab 1 — Pressure-Temperature Rating
// ====================================================================

function PtRatingTab({
  computed,
  rating,
  material,
}: {
  computed: ComputePMSResponse;
  rating: string;
  material: string;
}) {
  const pt = computed.pressure_temperature;
  if (!pt || pt.pending || !pt.temperatures_c || !pt.pressures_barg) {
    return (
      <Card title={<h3 className="font-semibold">Pressure-Temperature Rating</h3>}>
        <p className="text-sm text-muted-foreground py-8 text-center">
          No P-T data indexed for {rating} · {cleanMaterial(material)}.
        </p>
      </Card>
    );
  }

  // Read backend-prepared `display_columns` for the table (capped at
  // 300 °C by the backend). Falls back to the full curve only if the
  // backend is older and didn't send `display_columns` — keeps the
  // SPA degrading gracefully when deploys are out of sync. The SPA
  // never decides what to show; it just renders the columns the
  // backend declared visible.
  const display = pt.display_columns;
  const temps = display?.temperatures_c ?? pt.temperatures_c;
  const press = display?.pressures_barg ?? pt.pressures_barg;
  const labels = display?.temp_labels ?? pt.temp_labels ?? temps.map(String);
  const hydroP = pt.hydrotest_barg ?? (computed.derived_conditions.pressure.hydrotest_barg ?? 0);
  const designT = computed.design_conditions.design_temp_c;
  const highlightIdx = designT == null
    ? -1
    : temps.findIndex((t) => Number(t) === Number(designT));

  const adequacy = computed.adequacy;
  const derived = computed.derived_conditions;

  return (
    <div className="space-y-4">
      <Card
        title={
          <h3 className="font-semibold">
            Pressure-Temperature Rating
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ASME B16.5 / API 6A
            </span>
          </h3>
        }
      >
        <div className="text-xs text-muted-foreground mb-3">
          <strong>Standard:</strong> ASME B16.5
          {pt.group && (
            <>
              {" · "}
              <strong>Group:</strong> {pt.group}
            </>
          )}{" "}
          · <strong>Class:</strong> {rating} · <strong>Material:</strong>{" "}
          {cleanMaterial(material)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-border">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 py-1.5 border border-border"></th>
                {labels.map((l, i) => (
                  <th
                    key={i}
                    className={`px-2 py-1.5 border border-border ${
                      i === highlightIdx ? "bg-amber-100 text-amber-900" : ""
                    }`}
                  >
                    {String(l)}
                  </th>
                ))}
                <th
                  rowSpan={3}
                  className="px-2 py-1.5 border border-border bg-amber-50 text-amber-900 align-middle"
                >
                  HYDROTEST
                  <br />
                  PR. (BARG)
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-1.5 border border-border font-medium bg-muted/30">
                  Press., barg
                </td>
                {press.map((p, i) => (
                  <td
                    key={i}
                    className={`px-2 py-1.5 border border-border text-center ${
                      i === highlightIdx ? "bg-amber-50 font-semibold" : ""
                    }`}
                  >
                    {fmtP(p)}
                  </td>
                ))}
                <td
                  rowSpan={2}
                  className="px-2 py-1.5 border border-border text-center bg-amber-50 font-semibold align-middle"
                >
                  {fmtP(hydroP)}
                </td>
              </tr>
              <tr>
                <td className="px-2 py-1.5 border border-border font-medium bg-muted/30">
                  Temp., °C
                </td>
                {temps.map((t, i) => (
                  <td
                    key={i}
                    className={`px-2 py-1.5 border border-border text-center ${
                      i === highlightIdx ? "bg-amber-50 font-semibold" : ""
                    }`}
                  >
                    {String(labels[i] ?? t)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          <span className="inline-block w-3 h-3 align-middle bg-amber-100 border border-amber-300 rounded-sm mr-1" />
          Highlighted column = rating at design temperature.
        </p>
      </Card>

      {/* Adequacy banner — server-computed */}
      {adequacy && (
        <div
          className={
            "rounded-lg border-2 px-4 py-3 text-sm font-medium " +
            (adequacy.adequate
              ? "border-green-500 bg-green-50 text-green-800"
              : "border-red-500 bg-red-50 text-red-800")
          }
        >
          {adequacy.adequate ? "✓" : "✗"} Class <strong>{rating}</strong> is{" "}
          <strong>{adequacy.adequate ? "ADEQUATE" : "INADEQUATE"}</strong>:{" "}
          {fmt(adequacy.rated_pressure_at_design_t_barg, 1)} barg{" "}
          {adequacy.adequate ? "≥" : "<"} Design{" "}
          {fmt(adequacy.design_pressure_barg, 1)} barg at{" "}
          {fmt(adequacy.design_temp_c, 0)}°C
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2 text-sm text-amber-900">
        <strong>Derived Design Conditions</strong>{" "}
        <span className="text-xs text-amber-800">
          (auto-calculated from your inputs above)
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title={<h3 className="font-semibold text-sm">Pressure</h3>}>
          <KvList
            rows={[
              {
                label: "Design Pressure",
                value: `${fmt(derived.pressure.design_barg, 1)} barg (${fmt(derived.pressure.design_psig, 1)} psig)`,
                bold: true,
              },
              {
                label: "Hydrotest (1.5× max P)",
                value: `${fmt(derived.pressure.hydrotest_barg, 1)} barg (${fmt(derived.pressure.hydrotest_psig, 1)} psig)`,
                bold: true,
              },
              {
                label: "Operating (est. 80% DP)",
                value: `${fmt(derived.pressure.operating_estimate_barg, 1)} barg (${fmt(derived.pressure.operating_estimate_psig, 1)} psig)`,
                muted: true,
              },
            ]}
          />
        </Card>
        <Card title={<h3 className="font-semibold text-sm">Temperature</h3>}>
          <KvList
            rows={[
              {
                label: "Design Temperature",
                value: `${fmt(derived.temperature.design_c, 0)} °C (${fmt(derived.temperature.design_f, 1)} °F)`,
                bold: true,
              },
              {
                label: "Operating (est. 80% DT)",
                value: `${fmt(derived.temperature.operating_estimate_c, 1)} °C (${fmt(derived.temperature.operating_estimate_f, 1)} °F)`,
                muted: true,
              },
              {
                label: "MDMT",
                value: `${fmt(derived.temperature.mdmt_c, 0)} °C (${fmt(derived.temperature.mdmt_f, 1)} °F)`,
                bold: true,
              },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

// ====================================================================
// Tab 2 — Schedule & Wall Thickness (rendered from server snapshot)
// ====================================================================

function ScheduleTab({
  computed,
  rating,
  material,
  ca,
  service,
  jointType,
}: {
  computed: ComputePMSResponse;
  rating: string;
  material: string;
  ca: string;
  service: string;
  jointType: JointType;
}) {
  // ── WT-calc impossibility short-circuit ─────────────────────────
  // When the backend can't compute Wall Thickness at this design
  // point (S unavailable, W unavailable, etc.) it sets
  // `wall_thickness.unavailable: true`. Render a single clear error
  // block and skip every WT-dependent panel (formula card, design
  // parameters, WT table, summary stats, flags).
  if (computed.wall_thickness.unavailable) {
    return (
      <Card
        title={
          <h3 className="font-semibold text-sm text-red-900">
            Schedule &amp; Wall Thickness — Calculation Not Possible
          </h3>
        }
        className="border-2 border-red-300"
      >
        <div className="flex items-start gap-2 py-4">
          <AlertTriangle className="w-5 h-5 text-red-700 mt-0.5 flex-shrink-0" />
          <div className="space-y-2">
            <div className="text-sm text-red-900 leading-relaxed">
              {computed.wall_thickness.unavailable_reason ??
                "Wall thickness cannot be computed at this design point."}
            </div>
            <div className="text-[13px] text-red-900/80 leading-relaxed">
              The PMS report cannot be generated. Lower the design
              temperature, select a material whose ASME B31.3 stress
              curve covers this range (e.g. a chromium-molybdenum alloy
              steel for hot service), or consult a technical engineer
              for a non-standard design.
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const cf = computed.code_factors || {};
  const stressTable = cf.stress_table ?? null;
  const yCurve = cf.y_curve ?? null;
  const pt = computed.pressure_temperature;
  const designP = computed.design_conditions.design_pressure_barg ?? NaN;
  const designT = computed.design_conditions.design_temp_c ?? NaN;
  const mdmt = computed.design_conditions.mdmt_c ?? NaN;

  const coldPbarg = pt?.cold_point?.pressure_barg ?? null;
  const coldTc = pt?.temperatures_c?.[0] ?? null;
  const coldLabel =
    pt?.temp_labels?.[0] ?? (coldTc != null ? String(coldTc) : "—");
  const coldPpsig = coldPbarg != null ? coldPbarg * BARG_TO_PSIG : null;
  const designPpsig = Number.isFinite(designP) ? designP * BARG_TO_PSIG : null;
  const coldGoverns =
    coldPbarg != null && Number.isFinite(designP) && coldPbarg > designP;

  const E = JOINT_TYPES.find((j) => j.value === jointType)?.e ?? 1.0;
  const wValid = Number.isFinite(designT) && designT <= 510;
  // Mill tolerance is project policy (ASME B36.10M seamless). Comes
  // from the backend so we never have to hardcode it on this page.
  const millTolerance =
    computed.wall_thickness.summary.mill_tolerance ??
    computed.wall_thickness.formula_example?.mill_tolerance ??
    0.125;

  const formula = computed.wall_thickness.formula_example;
  const wtRows = computed.wall_thickness.rows;
  const wtSummary = computed.wall_thickness.summary;
  const flags = computed.wall_thickness.flags;

  const services = service
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isSS = /(?:^|\b)(SS|316|6\s*MO)/i.test(material);
  const pipeStandard = isSS
    ? 'ASME B36.19M (≤12") / B36.10M (>12")'
    : "ASME B36.10M";

  return (
    <div className="space-y-4">
      <FormulaCard formula={formula} designT={designT} coldLabel={coldLabel} />

      <div className="text-xs text-muted-foreground">
        <strong>Service:</strong>{" "}
        {services.length === 0 ? (
          <em className="text-muted-foreground/70">— none —</em>
        ) : (
          services.map((s, i) => (
            <span key={s}>
              {i > 0 && " · "}
              {s}
            </span>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title={<h3 className="font-semibold text-sm">Design Parameters</h3>}>
          <dl className="divide-y divide-border text-sm">
            <KvBlock label="PMS Class">
              <strong>
                {computed.class_code} ({rating})
              </strong>
            </KvBlock>
            <KvBlock label="Design Pressure (P)" stacked>
              {formula?.case_1 ? (
                // Envelope mode — backend emitted both cases. Show
                // the cold-end / design-point comparison so the
                // engineer sees what governs.
                <>
                  <div>
                    <strong>Min T / Max P:</strong> {fmt(coldPpsig, 1)} psig{" "}
                    <span className="text-muted-foreground">
                      ({fmt(coldPbarg, 1)} barg)
                    </span>{" "}
                    <span className="text-muted-foreground">@ {coldLabel}</span>{" "}
                    <GovTag governs={coldGoverns} />
                  </div>
                  <div>
                    <strong>Design Point:</strong> {fmt(designPpsig, 1)} psig{" "}
                    <span className="text-muted-foreground">
                      ({fmt(designP, 1)} barg)
                    </span>{" "}
                    <span className="text-muted-foreground">@ {fmt(designT, 0)}°C</span>{" "}
                    <GovTag governs={!coldGoverns} />
                  </div>
                  <div className="text-[11px] text-muted-foreground italic mt-1">
                    t<sub>REQ</sub> uses MAX(Case 1, Case 2) per size
                  </div>
                </>
              ) : (
                // User-pinned mode — design-point only.
                <>
                  <div>
                    <strong>Design Point:</strong> {fmt(designPpsig, 1)} psig{" "}
                    <span className="text-muted-foreground">
                      ({fmt(designP, 1)} barg)
                    </span>
                    {Number.isFinite(designT) && (
                      <>
                        {" "}
                        <span className="text-muted-foreground">
                          @ {fmt(designT, 0)}°C
                        </span>
                      </>
                    )}{" "}
                    <GovTag governs />
                  </div>
                  <div className="text-[11px] text-muted-foreground italic mt-1">
                    ASME B31.3 §304.1.2 Eq. 3a evaluated at this point only.
                  </div>
                </>
              )}
            </KvBlock>
            <KvBlock label="Design Temperature" stacked>
              {formula?.case_1 ? (
                <>
                  <div>
                    <strong>Min:</strong> {coldLabel}{" "}
                    <DimTag>P-T min</DimTag> <GovTag governs={coldGoverns} />
                  </div>
                  <div>
                    <strong>Max (Design):</strong> {fmt(designT, 0)}°C{" "}
                    <DimTag>design</DimTag> <GovTag governs={!coldGoverns} />
                  </div>
                </>
              ) : (
                <div>
                  <strong>Design:</strong> {fmt(designT, 0)}°C{" "}
                  <DimTag>design</DimTag> <GovTag governs />
                </div>
              )}
            </KvBlock>
            <KvBlock label="Material">
              <strong>{cleanMaterial(material)}</strong>
            </KvBlock>
            <KvBlock label="Material Spec">
              <em className="text-muted-foreground">— pending data source —</em>
            </KvBlock>
            <KvBlock label="Allowable Stress S(T)" stacked>
              {stressTable && formula?.case_1 && formula?.case_2 ? (
                // Envelope mode — show S at both endpoints.
                <>
                  <div>
                    <strong>S @ {coldLabel}:</strong>{" "}
                    {fmtNum(formula.case_1.S_psi)} psi{" "}
                    <GovTag governs={coldGoverns} />
                  </div>
                  <div>
                    <strong>S @ {fmt(designT, 0)}°C:</strong>{" "}
                    {fmtNum(formula.case_2.S_psi)} psi{" "}
                    <GovTag governs={!coldGoverns} />
                  </div>
                  <div className="text-[11px] text-muted-foreground italic mt-1">
                    per ASME B31.3 Table A-1 [{stressTable.key ?? cleanMaterial(material)}]
                  </div>
                </>
              ) : stressTable && formula?.case_2 ? (
                // User-pinned mode — single design point.
                <>
                  <div>
                    <strong>S @ {fmt(designT, 0)}°C:</strong>{" "}
                    {fmtNum(formula.case_2.S_psi)} psi{" "}
                    <GovTag governs />
                  </div>
                  <div className="text-[11px] text-muted-foreground italic mt-1">
                    per ASME B31.3 Table A-1 [{stressTable.key ?? cleanMaterial(material)}]
                  </div>
                </>
              ) : (
                <em className="text-muted-foreground">
                  No B31.3 Table A-1 entry for {cleanMaterial(material)}
                </em>
              )}
            </KvBlock>
          </dl>
        </Card>

        <Card
          title={<h3 className="font-semibold text-sm">Fabrication &amp; Code Factors</h3>}
        >
          <dl className="divide-y divide-border text-sm">
            <KvBlock label="Pipe Standard">
              <strong>{pipeStandard}</strong>
            </KvBlock>
            <KvBlock label="Joint Type">
              <strong>{jointType}</strong>
            </KvBlock>
            <KvBlock label="Joint Efficiency (E)">
              <strong>{E.toFixed(2).replace(/\.00$/, "")}</strong>
            </KvBlock>
            <KvBlock label="Y Coefficient">
              {formula?.Y != null ? (
                <>
                  <strong>{fmt(formula.Y, 2)}</strong>{" "}
                  <span className="text-[11px] text-muted-foreground italic">
                    per ASME B31.3 Table 304.1.1 (
                    {yCurve?.label ?? formula.Y_label ?? "unknown"})
                  </span>
                </>
              ) : (
                <em className="text-muted-foreground">
                  pending — no Y curve indexed for this material
                </em>
              )}
            </KvBlock>
            <KvBlock label="W-factor (Weld Str.)">
              {wValid ? (
                <>
                  <strong>1</strong>{" "}
                  <span className="text-[11px] text-muted-foreground italic">
                    per ASME B31.3 Table 302.3.5 (W=1)
                  </span>
                </>
              ) : (
                <em className="text-muted-foreground">
                  pending — design T {fmt(designT, 0)}°C above 510°C creep onset
                </em>
              )}
            </KvBlock>
            <KvBlock label="Corrosion Allow. (c)">
              <strong>{ca}</strong>
            </KvBlock>
            <KvBlock label="Mill Undertolerance">
              <strong>{(millTolerance * 100).toFixed(1)}%</strong>
            </KvBlock>
          </dl>
        </Card>
      </div>

      {/* ── Engineering Requirements & Flags ── */}
      <div>
        <h3 className="text-sm font-semibold mb-2 inline-flex items-center gap-1.5 text-amber-700">
          <AlertTriangle className="w-4 h-4" />
          Engineering Requirements &amp; Flags
        </h3>
        {flags.length === 0 ? (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            ✓ All clear — no engineering flags raised for this configuration.
          </div>
        ) : (
          <div className="space-y-2">
            {flags.map((f, i) => (
              <FlagCard key={i} flag={f} />
            ))}
          </div>
        )}
      </div>

      {/* ── Wall Thickness Calculation Table ── */}
      <div>
        <h3 className="text-sm font-semibold mb-2">
          Wall Thickness Calculation Table
        </h3>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-2 py-2">NPS</th>
                <th className="px-2 py-2">
                  D<br />
                  <span className="text-[10px] opacity-70">(MM)</span>
                </th>
                <th className="px-2 py-2">
                  T<br />
                  <span className="text-[10px] opacity-70">(MM)</span>
                </th>
                <th className="px-2 py-2">
                  D/6<br />
                  <span className="text-[10px] opacity-70">(MM)</span>
                </th>
                <th className="px-2 py-2">
                  IF<br />T&lt;D/6
                </th>
                <th className="px-2 py-2">
                  T<sub>M</sub><br />
                  <span className="text-[10px] opacity-70">(MM)</span>
                </th>
                <th className="px-2 py-2">
                  MILL<br />TOL.
                </th>
                <th className="px-2 py-2">
                  CALC. THK<br />T (MM)
                </th>
                <th className="px-2 py-2">SCH</th>
                <th className="px-2 py-2">
                  SEL. THK<br />
                  <span className="text-[10px] opacity-70">(MM)</span>
                </th>
                <th className="px-2 py-2">
                  SEL. THK<br />STATUS
                </th>
              </tr>
            </thead>
            <tbody>
              {wtRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-2 py-4 text-center text-muted-foreground"
                  >
                    Enter design conditions to compute the wall-thickness table.
                  </td>
                </tr>
              ) : (
                wtRows.map((r) => <WtTableRow key={r.nps} row={r} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Summary Statistics + Tag Legend ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title={<h3 className="font-semibold text-sm">Summary Statistics</h3>}>
          <KvList
            rows={[
              {
                label: "Min MAWP",
                value:
                  wtSummary.min_mawp_barg != null
                    ? `${fmt(wtSummary.min_mawp_barg, 1)} barg`
                    : "—",
              },
              {
                label: "Max MAWP",
                value:
                  wtSummary.max_mawp_barg != null
                    ? `${fmt(wtSummary.max_mawp_barg, 1)} barg`
                    : "—",
              },
              {
                label: "Min Pressure Margin",
                value:
                  wtSummary.min_margin_pct != null
                    ? `${fmt(wtSummary.min_margin_pct, 1)} %`
                    : "—",
              },
              {
                label: "Hydrotest Pressure (1.5×P)",
                value: `${fmt(wtSummary.hydrotest_barg, 1)} barg`,
                bold: true,
              },
              {
                label: "Total NPS Sizes",
                value: String(wtSummary.total_nps_sizes ?? wtRows.length),
              },
            ]}
          />
        </Card>
        <Card title={<h3 className="font-semibold text-sm">Tag Legend</h3>}>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium">
              Pressure
            </span>
            <span className="text-muted-foreground">ASME B31.3 Eq. 3a governs</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Tab-2 helper components ────────────────────────────────────────

function GovTag({ governs }: { governs: boolean }) {
  return governs ? (
    <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-800 align-middle">
      [GOVERNS]
    </span>
  ) : (
    <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 align-middle">
      [active]
    </span>
  );
}

function DimTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground align-middle">
      [{children}]
    </span>
  );
}

function KvBlock({
  label,
  stacked = false,
  children,
}: {
  label: string;
  stacked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        "py-1.5 " +
        (stacked ? "block" : "grid grid-cols-[1fr_2fr] items-baseline gap-2")
      }
    >
      <dt className={"text-xs text-muted-foreground " + (stacked ? "mb-0.5" : "")}>
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function WtTableRow({ row }: { row: ComputeWtRow }) {
  // `notOk` = "no stock B36.10M / B36.19M schedule fits calc_thk" —
  // drives SCH '—' blanking and the rounded-up SEL.THK echo. Reads
  // sch_status directly because that's its semantic meaning.
  const notOk = row.sch_status === "NOT OK";
  const validCls =
    row.validity === "ALERT"
      ? "text-amber-700 font-semibold"
      : "text-green-700";
  // User-facing STATUS column uses `sel_thk_status` — compares the
  // EFFECTIVE displayed SEL.THK (= sel_thk_mm for OK rows, ceil-1dp
  // calc_thk for fallback rows) against calc_thk. Custom-fab rounded-up
  // rows clear the requirement by construction and correctly read OK
  // here even when sch_status reports NOT OK. Falls back to sch_status
  // for legacy snapshots that pre-date the field.
  const effStatus = row.sel_thk_status ?? row.sch_status;
  const statusCls =
    effStatus === "OK"
      ? "text-green-700 font-semibold"
      : effStatus === "NOT OK"
        ? "text-amber-700 font-semibold"
        : "";
  const schDisp = notOk ? "—" : row.sch_display ?? "—";
  // SEL. THK column — backend owns the precision rule (wt_calc.py):
  //   • NOT OK rows: echo calc_thk rounded UP to 1 dp. Backend ships
  //     this as the pre-formatted `sel_thk_mm_display` string; SPA
  //     renders it verbatim. JS ceil-1dp fallback handles legacy
  //     snapshots that pre-date the field.
  //   • OK rows: render the schedule's exact 2-decimal WT.
  const selThk = notOk
    ? row.sel_thk_mm_display ??
      (row.calc_thk_mm != null
        ? (Math.ceil(row.calc_thk_mm * 10) / 10).toFixed(1)
        : "—")
    : row.sel_thk_mm != null
      ? row.sel_thk_mm.toFixed(2)
      : "—";
  return (
    <tr className="border-t border-border hover:bg-muted/30">
      <td className="px-2 py-1.5 text-center font-medium text-amber-700">
        {row.nps}
      </td>
      <td className="px-2 py-1.5 text-center">{fmt(row.od_mm, 1)}</td>
      <td className="px-2 py-1.5 text-center">{fmt(row.t_mm, 3)}</td>
      <td className="px-2 py-1.5 text-center">{fmt(row.d_over_6, 3)}</td>
      <td className={`px-2 py-1.5 text-center ${validCls}`}>
        {row.validity ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-center">{fmt(row.tm_mm, 3)}</td>
      <td className="px-2 py-1.5 text-center">
        {(row.mill_tol * 100).toFixed(1)}%
      </td>
      <td className="px-2 py-1.5 text-center">{fmt(row.calc_thk_mm, 3)}</td>
      <td className="px-2 py-1.5 text-center">{schDisp}</td>
      <td className="px-2 py-1.5 text-center">{selThk}</td>
      <td className={`px-2 py-1.5 text-center ${statusCls}`}>
        {effStatus ?? "—"}
      </td>
    </tr>
  );
}

function FlagCard({ flag }: { flag: ComputeFlag }) {
  const palette: Record<ComputeFlag["level"], string> = {
    critical: "border-red-300 bg-red-50 text-red-900",
    mandatory: "border-amber-300 bg-amber-50 text-amber-900",
    warning: "border-yellow-300 bg-yellow-50 text-yellow-900",
    note: "border-amber-300 bg-amber-50 text-amber-900",
  };
  const badge: Record<ComputeFlag["level"], string> = {
    critical: "bg-red-600 text-white",
    mandatory: "bg-amber-600 text-white",
    warning: "bg-yellow-500 text-white",
    note: "bg-amber-600 text-white",
  };
  const label: Record<ComputeFlag["level"], string> = {
    critical: "Critical",
    mandatory: "Mandatory",
    warning: "Warning",
    note: "Note",
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${palette[flag.level]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${badge[flag.level]}`}
        >
          {label[flag.level]}
        </span>
        <span className="font-semibold text-sm">{flag.title}</span>
      </div>
      <p className="text-xs leading-relaxed">{flag.body}</p>
    </div>
  );
}

// ── B31.3 Eq. 3a worked-example card (rendered from server data) ─

function FormulaCard({
  formula,
  designT,
  coldLabel,
}: {
  formula: ComputePMSResponse["wall_thickness"]["formula_example"];
  designT: number;
  coldLabel: string;
}) {
  if (!formula) {
    return (
      <Card
        title={
          <h3 className="font-semibold text-sm">
            ASME B31.3 §304.1.2 — Internal Pressure (Eq. 3a, enhanced with W-factor)
          </h3>
        }
      >
        <p className="text-xs text-muted-foreground italic">
          Worked example unavailable — NPS dimensions not loaded yet.
        </p>
      </Card>
    );
  }
  if (!formula.available) {
    return (
      <Card
        title={
          <h3 className="font-semibold text-sm">
            ASME B31.3 §304.1.2 — Internal Pressure (Eq. 3a, enhanced with W-factor)
          </h3>
        }
      >
        <pre className="text-xs bg-muted/40 px-3 py-2 rounded font-mono overflow-x-auto">
          t_req = (P × OD) / [2 × (S × E × W + P × Y)] + c
        </pre>
        <p className="text-xs text-muted-foreground italic mt-2">
          {formula.reason ??
            "Worked example needs allowable stress — not available for this material."}
        </p>
      </Card>
    );
  }

  const fmtIn = (v: number | null | undefined) =>
    v == null ? "—" : `${v.toFixed(4)}"`;
  return (
    <Card
      title={
        <h3 className="font-semibold text-sm">
          ASME B31.3 §304.1.2 — Internal Pressure (Eq. 3a, enhanced with W-factor)
        </h3>
      }
    >
      <pre className="text-xs bg-muted/40 px-3 py-2 rounded font-mono overflow-x-auto">
        t_req = (P × OD) / [2 × (S × E × W + P × Y)] + c
      </pre>
      <div className="text-xs space-y-1.5 mt-3">
        <div>
          <strong>NPS {formula.nps}" example:</strong> OD ={" "}
          {formula.od_in.toFixed(3)}" | E = {formula.E} | W ={" "}
          {formula.W ?? "—"} | Y = {formula.Y.toFixed(2)}{" "}
          <DimTag>{formula.Y_label}</DimTag> | c = {formula.C_in.toFixed(4)}"{" "}
          <DimTag>{formula.C_mm} mm</DimTag> | mill tol ={" "}
          <span className="text-amber-700 font-semibold">
            {(formula.mill_tolerance * 100).toFixed(1)}%
          </span>
        </div>
        {formula.case_1 && (
          <div>
            <strong>{formula.case_1.label}:</strong> P ={" "}
            {fmt(formula.case_1.P_psig, 1)} psig, S = {fmtNum(formula.case_1.S_psi)} psi
            → t<sub>press</sub> ={" "}
            <span className="text-amber-700 font-semibold">
              {fmtIn(formula.case_1.t_press_in)}
            </span>{" "}
            {formula.case_1.governs && (
              <span className="text-green-700 font-bold ml-1">← GOVERNS</span>
            )}
          </div>
        )}
        {formula.case_2 && (
          <div>
            <strong>{formula.case_2.label}:</strong> P ={" "}
            {fmt(formula.case_2.P_psig, 1)} psig, S = {fmtNum(formula.case_2.S_psi)} psi
            → t<sub>press</sub> ={" "}
            <span className="text-amber-700 font-semibold">
              {fmtIn(formula.case_2.t_press_in)}
            </span>{" "}
            {formula.case_2.governs && (
              <span className="text-green-700 font-bold ml-1">← GOVERNS</span>
            )}
          </div>
        )}
        {formula.t_press_in != null && (
          <div className="border-t border-border pt-2 mt-2 text-red-700">
            Using {formula.governing_case === 1 ? "Case 1 (Min T / Max P)" : "Case 2 (Design Point)"}:
            t = {fmtIn(formula.t_press_in)} → t<sub>m</sub> = t+c ={" "}
            {fmtIn(formula.tm_in)} → T<sub>REQ</sub> = t<sub>m</sub>/(1−
            {(formula.mill_tolerance * 100).toFixed(1)}%) ={" "}
            <strong>{fmtIn(formula.T_req_in)}</strong> (
            {formula.T_req_mm?.toFixed(2)} mm)
          </div>
        )}
        <div className="text-[11px] text-muted-foreground italic pt-1">
          • t<sub>min</sub> = (t<sub>req</sub> + c) / (1 − 12.5%) &nbsp;|&nbsp; • MAWP =
          [2×S×E×W×t<sub>eff</sub>] / [OD − 2×Y×t<sub>eff</sub>] &nbsp;|&nbsp; • t
          <sub>eff</sub> = WT<sub>nom</sub> × (1 − mill%) − c − mech
        </div>
      </div>
    </Card>
  );
}

// ====================================================================
// Tab 3 — Pipe & Fittings Material Assignment
// ====================================================================

function MaterialsTab({
  computed,
  material,
}: {
  computed: ComputePMSResponse;
  material: string;
}) {
  const branch = computed.code_factors.branch_chart;
  const matTab = computed.materials_tab;

  if (!matTab) {
    return (
      <Card
        title={
          <h3 className="font-semibold">Pipe &amp; Fittings Material Assignment</h3>
        }
      >
        <p className="text-sm text-muted-foreground py-6 text-center">
          No fitting spec mapped for {cleanMaterial(material)} — pending project
          data source.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">
          Pipe &amp; Fittings Material Assignment
        </h2>
        <p className="text-sm text-muted-foreground">
          Material codes assigned for pipes, elbows, tees, reducers, and branch
          fittings per specification.
        </p>
      </div>

      <BoreSection label="Small Bore" bore={matTab.small_bore} />
      <BoreSection label="Large Bore" bore={matTab.large_bore} />

      <Card title={<h3 className="font-semibold text-sm">BRANCH CONNECTION CHART</h3>}>
        {branch ? (
          <BranchChartView chart={branch} />
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No branch chart available for this material family.
          </p>
        )}
      </Card>
    </div>
  );
}

function BoreSection({
  label,
  bore,
}: {
  label: string;
  bore: ComputeMaterialsBore;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-slate-800 border-b border-border pb-1">
        {label}{" "}
        <span className="text-xs font-normal text-muted-foreground">
          ({bore.range})
        </span>
      </h3>
      <div className="rounded-md border-l-4 border-amber-500 bg-amber-50/60 px-3 py-2 text-sm">
        <strong className="text-amber-900">Connection:</strong>{" "}
        <span className="text-amber-700">{bore.connection}</span>
        <span className="text-amber-300 mx-2">|</span>
        <strong className="text-amber-900">Schedule:</strong>{" "}
        <span className="text-amber-700">{bore.schedule}</span>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-white">
            <tr>
              <th className="px-3 py-2 text-left font-semibold uppercase text-xs">
                Component
              </th>
              <th className="px-3 py-2 text-left font-semibold uppercase text-xs">
                Material
              </th>
              <th className="px-3 py-2 text-left font-semibold uppercase text-xs">
                Schedule/Class
              </th>
              <th className="px-3 py-2 text-left font-semibold uppercase text-xs">
                Standard
              </th>
            </tr>
          </thead>
          <tbody>
            {bore.rows.map((r, i) => (
              <tr
                key={r.component}
                className={i % 2 === 0 ? "bg-white" : "bg-muted/30"}
              >
                <td className="px-3 py-2 font-semibold">{r.component}</td>
                <td className="px-3 py-2">{r.material}</td>
                <td className="px-3 py-2">{r.schedule}</td>
                <td className="px-3 py-2">{r.standard}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Branch chart ──────────────────────────────────────────────────

function fmtNps(n: number): string {
  if (n === 0.5) return '½"';
  if (n === 0.75) return '¾"';
  if (n === 1.5) return '1½"';
  return `${n}"`;
}

function branchCellPalette(code: string): { bg: string; text: string } {
  switch (code) {
    case "T":  return { bg: "bg-amber-100",   text: "text-amber-800"   };
    case "RT": return { bg: "bg-purple-100", text: "text-purple-800" };
    case "W":  return { bg: "bg-amber-100",  text: "text-amber-800"  };
    case "S":  return { bg: "bg-green-100",  text: "text-green-800"  };
    case "H":  return { bg: "bg-orange-100", text: "text-orange-800" };
    case "-":  return { bg: "bg-muted/30",   text: "text-muted-foreground" };
    default:   return { bg: "bg-white",      text: "" };
  }
}

function BranchChartView({
  chart,
}: {
  chart: NonNullable<ComputePMSResponse["code_factors"]["branch_chart"]>;
}) {
  const axis = chart.nps_axis ?? [];
  const matrix = chart.matrix ?? [];
  const legend = chart.legend ?? {};
  if (!axis.length || !matrix.length) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Branch chart data unavailable.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        {chart.title && (
          <div className="text-sm font-bold text-slate-800">{chart.title}</div>
        )}
        {chart.subtitle && (
          <div className="text-xs text-muted-foreground">{chart.subtitle}</div>
        )}
        {chart.resolved_family && (
          <div className="text-xs text-muted-foreground">
            For material family:{" "}
            <strong className="text-slate-800">{chart.resolved_family}</strong>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="px-2 py-1.5 bg-slate-800 text-white font-semibold text-left whitespace-nowrap">
                RUN ↓ / BRANCH →
              </th>
              {axis.map((n, i) => (
                <th
                  key={i}
                  className="px-2 py-1.5 bg-slate-800 text-white font-semibold text-center min-w-[42px]"
                >
                  {fmtNps(n)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, ridx) => (
              <tr key={ridx}>
                <th className="px-2 py-1.5 bg-muted/40 text-left font-semibold border-r border-border whitespace-nowrap">
                  {fmtNps(axis[ridx])}
                </th>
                {axis.map((_, cidx) => {
                  if (cidx >= row.length) {
                    return (
                      <td key={cidx} className="px-2 py-1.5 border border-border/50" />
                    );
                  }
                  const code = row[cidx];
                  const palette = branchCellPalette(code);
                  return (
                    <td
                      key={cidx}
                      title={legend[code] ?? code}
                      className={`px-2 py-1.5 text-center font-mono font-semibold border border-border/50 ${palette.bg} ${palette.text}`}
                    >
                      {code}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Object.keys(legend).length > 0 && (
        <div className="flex flex-wrap gap-3 text-[11px] pt-2 border-t border-border">
          {Object.entries(legend).map(([code, label]) => {
            const palette = branchCellPalette(code);
            return (
              <span key={code} className="inline-flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center justify-center w-6 h-5 rounded font-mono font-semibold ${palette.bg} ${palette.text}`}
                >
                  {code}
                </span>
                <span className="text-muted-foreground uppercase tracking-wide font-medium">
                  {label}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ====================================================================
// Tab 4 — Components & AI Engineering Notes
// ====================================================================

function ComponentsTab({
  computed,
}: {
  computed: ComputePMSResponse;
}) {
  const fe = computed.code_factors.flange_extras || {};
  const fs = computed.code_factors.fitting_specs || {};
  const valves = fe.valves || {};

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800">
          Flanges, Bolting, Valves &amp; Components
        </h2>
        <p className="text-sm text-muted-foreground">
          Material specifications for flanges, gaskets, bolts, valves, and special
          components, plus project standard notes for this class.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SpecCard title="FLANGE">
          <SpecRow label="MOC" value={(fs.flange as string) || "—"} bold />
          {fe.face && (
            <SpecRow
              label="FACE"
              value={
                <>
                  <strong>{fe.face.code}</strong>{" "}
                  <span className="text-muted-foreground">({fe.face.label})</span>
                </>
              }
            />
          )}
          {fe.type?.type && <SpecRow label="Type" value={fe.type.type} />}
          {fe.type?.compact && (
            <SpecRow label="Compact Flange" value={fe.type.compact} />
          )}
          {fe.type?.hub && <SpecRow label="Hub Connector" value={fe.type.hub} />}
        </SpecCard>

        <SpecCard title="BOLTS / NUTS / GASKETS">
          {fe.bolting?.stud && (
            <SpecRow label="Stud Bolts" value={fe.bolting.stud} />
          )}
          {fe.bolting?.hex_nut && (
            <SpecRow label="Hex Nuts" value={fe.bolting.hex_nut} />
          )}
          {fe.gasket?.spec && <SpecRow label="Gasket" value={fe.gasket.spec} />}
        </SpecCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SpecCard title="VALVES">
          {valves.rating && (
            <SpecRow label="Rating" value={valves.rating} bold />
          )}
          {valves.body && (
            <SpecRow label="Body MOC" value={valves.body} bold />
          )}
          <ValveRow label="Ball" entry={valves.ball} />
          <ValveRow label="Gate" entry={valves.gate} />
          <ValveRow label="Globe" entry={valves.globe} />
          <ValveRow label="Check" entry={valves.check} />
          <ValveRow label="Butterfly" entry={valves.butterfly} />
          <ValveRow label="DBB" entry={valves.dbb} />
          <ValveRow label="DBB (Inst.)" entry={valves.dbb_inst} />
          <ValveRow label="Needle" entry={valves.needle} />
        </SpecCard>

        <SpecCard title="SPECTACLE BLIND / SPACER">
          {fe.spectacle?.moc && (
            <SpecRow label="MOC" value={fe.spectacle.moc} bold />
          )}
          {fe.spectacle?.small_bore && (
            <SpecRow label="Standard (Small)" value={fe.spectacle.small_bore} bold />
          )}
          {fe.spectacle?.large_bore && (
            <SpecRow label="Standard (Large)" value={fe.spectacle.large_bore} bold />
          )}
        </SpecCard>
      </div>

      {/* Project standard NOTES — backend-driven from
          pms-generator-new/app/data/pms_notes.json. Each note is
          filtered through its `when` predicate against the current
          rating / material / service / design T. Edit the JSON to
          change wording or conditions; no SPA edit needed. */}
      {computed.project_notes && computed.project_notes.length > 0 && (
        <Card title={<h3 className="font-semibold text-sm">Notes</h3>}>
          <table className="w-full text-sm">
            <tbody>
              {computed.project_notes.map((n) => (
                <tr key={n.id} className="border-t border-border first:border-t-0">
                  <td className="px-3 py-2 text-center font-bold text-muted-foreground bg-muted/30 w-12 align-top">
                    {n.id}
                  </td>
                  <td className="px-3 py-2 align-top">{n.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* AI Engineering Notes card removed per request.
          The handler, state, props, and pmsApi.generatePMSNotes call
          have all been excised. Project standard Notes (above) still
          render from computed.project_notes — those come from the
          pms_notes.json data file, not the AI service. */}
    </div>
  );
}

// ── Tab-4 spec card primitives ─────────────────────────────────────

function SpecCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="px-4 pt-3">
        <h3 className="text-xs font-bold tracking-wide text-slate-800 uppercase pb-1.5 border-b-2 border-slate-800">
          {title}
        </h3>
      </div>
      <div className="px-4 py-2 divide-y divide-border">{children}</div>
    </div>
  );
}

function SpecRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 items-baseline text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={"text-right " + (bold ? "font-semibold" : "")}>{value}</dd>
    </div>
  );
}

function ValveRow({
  label,
  entry,
}: {
  label: string;
  entry?: { code?: string; desc?: string } | undefined;
}) {
  if (!entry || (!entry.code && !entry.desc)) return null;
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">
        {entry.code && (
          <div className="font-mono font-semibold text-amber-700">{entry.code}</div>
        )}
        {entry.desc && (
          <div className="text-xs text-muted-foreground italic mt-0.5 leading-relaxed">
            {entry.desc}
          </div>
        )}
      </dd>
    </div>
  );
}

// ====================================================================
// Reusable key-value list
// ====================================================================

function KvList({
  title,
  rows,
}: {
  title?: string;
  rows: { label: string; value: string; bold?: boolean; muted?: boolean }[];
}) {
  return (
    <div>
      {title && (
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
          {title}
        </div>
      )}
      <dl className="divide-y divide-border">
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-2 gap-2 py-1.5 text-sm items-baseline"
          >
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd
              className={
                (r.bold ? "font-semibold " : "") +
                (r.muted ? "text-muted-foreground italic" : "")
              }
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
