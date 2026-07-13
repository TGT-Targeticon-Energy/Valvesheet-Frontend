/**
 * DatasheetCard — Shows a generated datasheet with VDS code, key specs, and download.
 *
 * Polished card with gradient header, completion ring, key field preview,
 * and professional XLSX download via shared excelBuilder.
 * Preview opens the same popup modal used in SuggestionCard.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  FileSpreadsheet, Download, Eye, CheckCircle, Loader2, X, AlertCircle,
  XCircle, AlertTriangle, ShieldX, OctagonX,
} from "lucide-react";
import { downloadSingleDatasheet } from "@/lib/excelBuilder";
import { constructionOrderFor, materialOrderFor } from "@/lib/fieldOrders";
import { SaveToWorkflowButton } from "./SaveToWorkflowButton";

// Fields that must NEVER appear in the card preview body or "Other" group.
// `vds_no` is already shown in the card header. The other four are explicitly
// excluded from card output per requirements.
const EXCLUDED_PREVIEW_KEYS = new Set<string>([
  "vds_no", "nace_compliant", "low_temperature", "min_design_temp", "design_code",
]);

// ── Field display names (same as SuggestionCard) ──

const FIELD_NAMES: Record<string, string> = {
  valve_type: "Valve Type",
  piping_class: "Piping Class",
  size_range: "Size Range",
  valve_standard: "Valve Standard",
  pressure_class: "Pressure Class",
  design_pressure: "Design Pressure",
  design_temperature: "Design Temperature",
  corrosion_allowance: "Corrosion Allowance",
  sour_service: "Sour Service",
  end_connections: "End Connections",
  face_to_face: "Face to Face",
  service: "Service",
  operation: "Operation",
  body_construction: "Body",
  ball_construction: "Ball",
  stem_construction: "Stem",
  seat_construction: "Seat",
  disc_construction: "Disc",
  wedge_construction: "Wedge",
  shaft_construction: "Shaft",
  back_seat_construction: "Back Seat",
  packing_construction: "Packing",
  bonnet_construction: "Bonnet",
  construction_bonnet: "Bonnet (Construction)",
  locks: "Locks",
  body_material: "Body",
  ball_material: "Ball",
  stem_material: "Stem",
  seat_material: "Seat",
  seal_material: "Seal",
  gland_material: "Gland",
  gland_packing: "Gland Packing",
  lever_handwheel: "Lever / Handwheel",
  spring_material: "Spring",
  gaskets: "Gaskets",
  bolts: "Bolts",
  nuts: "Nuts",
  disc_material: "Disc",
  wedge_material: "Wedge",
  trim_material: "Trim",
  shaft_material: "Shaft",
  needle_material: "Needle",
  material_needle_material: "Needle Material",
  back_seat_material: "Back Seat",
  hinge_pin_material: "Hinge Pin",
  material_cover_material: "Cover Material",
  "material_hinge/_hinge_pin": "Hinge / Hinge Pin",
  marking_purchaser: "Marking - Purchaser",
  marking_manufacturer: "Marking - Manufacturer",
  inspection_testing: "Inspection - Testing",
  leakage_rate: "Leakage Rate",
  hydrotest_shell: "Hydrotest Shell",
  hydrotest_closure: "Hydrotest Closure",
  pneumatic_test: "Pneumatic Test",
  material_certification: "Material Certification",
  fire_rating: "Fire Rating",
  finish: "Finish",
};

function buildSectionGroups(data: Record<string, string>): { title: string; keys: string[] }[] {
  const valveType = data.valve_type || "";
  return [
    {
      title: "Basic Information",
      keys: [
        "piping_class", "size_range", "valve_type", "service", "valve_standard",
        "pressure_class", "design_pressure", "design_temperature",
        "corrosion_allowance", "sour_service",
        "end_connections", "face_to_face", "operation",
      ],
    },
    { title: "Construction", keys: constructionOrderFor(valveType) },
    { title: "Materials", keys: materialOrderFor(valveType) },
    {
      title: "Testing & Compliance",
      keys: [
        "marking_purchaser", "marking_manufacturer", "inspection_testing", "leakage_rate",
        "hydrotest_shell", "hydrotest_closure", "pneumatic_test", "material_certification",
        "fire_rating", "finish",
      ],
    },
  ];
}

function valveTypeHiddenKeys(data: Record<string, string>): Set<string> {
  const valveType = String(data.valve_type || "").toLowerCase();
  const hidden = new Set<string>();
  // Butterfly / lug-shaft layout: no spring trim row on VMS.
  const shaft = String(data.shaft_material || "").trim();
  const stem = String(data.stem_material || "").trim();
  const isButterflyLayout =
    valveType.includes("butterfly") || (shaft.length > 0 && stem.length === 0);
  if (isButterflyLayout) hidden.add("spring_material");
  // Globe (AI/chat card): VMS omits seal + spring rows; hide misplaced ball/wedge/shaft/bonnet construction.
  if (valveType.includes("globe")) {
    hidden.add("seal_material");
    hidden.add("spring_material");
    for (const k of [
      "ball_construction",
      "wedge_construction",
      "shaft_construction",
      "bonnet_construction",
    ]) {
      hidden.add(k);
    }
  }
  return hidden;
}

// ── Preview Modal (same style as SuggestionCard) ──

interface PreviewModalProps {
  vdsCode: string;
  data: Record<string, string>;
  sessionId?: string;
  validationErrors?: string[];
  validationWarnings?: string[];
  projectName?: string;
  docNumber?: string;
  revision?: string;
  onClose: () => void;
}

function DatasheetPreviewModal({ vdsCode, data, sessionId, validationErrors, validationWarnings, projectName, docNumber, revision, onClose }: PreviewModalProps) {
  const [downloading, setDownloading] = useState(false);
  const hasErrors = (validationErrors?.length ?? 0) > 0;
  const hasWarnings = (validationWarnings?.length ?? 0) > 0;
  const hiddenKeys = valveTypeHiddenKeys(data);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadSingleDatasheet(
        { vdsCode, data, validationErrors, validationWarnings, projectName, docNumber, revisionNumber: revision },
        sessionId,
      );
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-[95vw] max-w-5xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0 border-b border-gray-300" style={{ backgroundColor: '#EEEEEE' }}>
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-gray-600" />
            <span className="font-mono font-bold text-lg text-gray-800 tracking-wide">{vdsCode}</span>
            {hasErrors ? (
              <div className="flex items-center gap-1.5 bg-red-100 border border-red-300 rounded-full px-2.5 py-1">
                <ShieldX className="w-3.5 h-3.5 text-red-600" />
                <span className="text-xs font-bold text-red-700">{validationErrors!.length} {validationErrors!.length === 1 ? "Error" : "Errors"}</span>
              </div>
            ) : hasWarnings ? (
              <div className="flex items-center gap-1.5 bg-amber-100 border border-amber-300 rounded-full px-2.5 py-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs font-bold text-amber-700">{validationWarnings!.length} {validationWarnings!.length === 1 ? "Warning" : "Warnings"}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-green-100 border border-green-300 rounded-full px-2.5 py-1">
                <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs font-semibold text-green-700">Ready</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/60 text-gray-700 hover:bg-white/90 disabled:opacity-50 transition-colors"
            >
              {downloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {downloading ? "Generating..." : "Download XLSX"}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/60 transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-5">

            {/* Project metadata */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
              <div>
                <span className="text-gray-400 block">Project</span>
                <span className="text-gray-700 font-medium">{projectName || "FPSO P-82 Albacora Leste"}</span>
              </div>
              <div>
                <span className="text-gray-400 block">Doc No.</span>
                <span className="text-gray-700 font-medium">{docNumber || "40801-SPE-80000-PP-SP-0001"}</span>
              </div>
            </div>

            {/* Safety/Warning banner */}
            {hasErrors && (
              <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <OctagonX className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <span className="text-sm font-bold text-red-800">UNSAFE SPECIFICATION — Validation Errors Found</span>
                </div>
                <div className="space-y-1.5 ml-7">
                  {validationErrors!.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-red-700">
                      <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-red-500" />
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {hasWarnings && (
              <div className={`rounded-lg border-2 border-amber-300 bg-amber-50 p-3 ${hasErrors ? "" : ""}`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <span className="text-sm font-bold text-amber-800">Warnings — Review Before Approval</span>
                </div>
                <div className="space-y-1.5 ml-7">
                  {validationWarnings!.map((warn, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-amber-700">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                      <span>{warn}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sections */}
            {buildSectionGroups(data).map((section) => {
              const hasPressure = data.design_pressure && data.design_pressure !== "-" && data.design_pressure.trim();
              const hasTemp = data.design_temperature && data.design_temperature !== "-" && data.design_temperature.trim();
              const mergeDuty = hasPressure && hasTemp;
              const rows = section.keys
                .filter((key) => !hiddenKeys.has(key) && !EXCLUDED_PREVIEW_KEYS.has(key))
                .filter((key) => data[key] && data[key] !== "-" && data[key].trim())
                .filter((key) => !(mergeDuty && key === "design_temperature"))
                .map((key) => {
                  if (mergeDuty && key === "design_pressure") {
                    return { key, label: FIELD_NAMES[key] || key, value: `${data.design_pressure} @ ${data.design_temperature}` };
                  }
                  return { key, label: FIELD_NAMES[key] || key, value: data[key] };
                });
              if (rows.length === 0) return null;
              return (
                <div key={section.title}>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">
                    {section.title}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {rows.map(({ key, label, value }) => (
                      <div key={key} className="flex items-baseline gap-2 py-0.5">
                        <span className="text-xs text-gray-400 w-28 flex-shrink-0 truncate">{label}</span>
                        <span className="text-sm text-gray-800 break-words">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Notes section — rendered only when backend provides notes */}
            {(() => {
              const notes = (data.notes || data.datasheet_notes || "").trim();
              if (!notes || notes === "-") return null;
              return (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">
                    Notes
                  </h3>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{notes}</p>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── DatasheetCard ──

interface DatasheetCardProps {
  vdsCode: string;
  data: Record<string, string>;
  completionPct: number;
  onPreview?: (vdsCode: string) => void;
  sessionId?: string;
  validationErrors?: string[];
  validationWarnings?: string[];
  projectName?: string;
  docNumber?: string;
  revision?: string;
}

export function DatasheetCard({ vdsCode, data, sessionId, validationErrors, validationWarnings, projectName, docNumber, revision }: DatasheetCardProps) {
  const [downloading, setDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const hasErrors = (validationErrors?.length ?? 0) > 0;
  const hasWarnings = (validationWarnings?.length ?? 0) > 0;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadSingleDatasheet(
        { vdsCode, data, validationErrors, validationWarnings, projectName, docNumber, revisionNumber: revision },
        sessionId,
      );
    } finally {
      setDownloading(false);
    }
  };

  const valveType = data.valve_type || "";
  const pressureClass = data.pressure_class || "";
  const endConn = data.end_connections || "";
  const bodyMat = data.body_material || "";
  const sizeRange = data.size_range || "";

  const keyFields = [
    { label: "Type", value: valveType },
    { label: "Class", value: pressureClass },
    { label: "Material", value: bodyMat.length > 40 ? bodyMat.slice(0, 40) + "..." : bodyMat },
    { label: "Size", value: sizeRange },
    { label: "Ends", value: endConn },
  ].filter((f) => f.value);

  return (
    <>
      {showPreview && (
        <DatasheetPreviewModal
          vdsCode={vdsCode}
          data={data}
          sessionId={sessionId}
          validationErrors={validationErrors}
          validationWarnings={validationWarnings}
          projectName={projectName}
          docNumber={docNumber}
          revision={revision}
          onClose={() => setShowPreview(false)}
        />
      )}
      <div className={`rounded-xl border bg-white shadow-md my-3 max-w-md overflow-hidden ${
        hasErrors ? "border-red-300 shadow-red-100" : hasWarnings ? "border-amber-300 shadow-amber-50" : "border-gray-200"
      }`}>
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-300" style={{ backgroundColor: '#EEEEEE' }}>
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-gray-600" />
            <span className="font-mono font-bold text-base text-gray-800 tracking-wide">{vdsCode}</span>
          </div>
          {hasErrors ? (
            <div className="flex items-center gap-1.5 bg-red-100 border border-red-300 rounded-full px-2.5 py-1 animate-pulse">
              <ShieldX className="w-3.5 h-3.5 text-red-600" />
              <span className="text-xs font-bold text-red-700">{validationErrors!.length} {validationErrors!.length === 1 ? "Error" : "Errors"}</span>
            </div>
          ) : hasWarnings ? (
            <div className="flex items-center gap-1.5 bg-amber-100 border border-amber-300 rounded-full px-2.5 py-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-xs font-bold text-amber-700">{validationWarnings!.length} {validationWarnings!.length === 1 ? "Warning" : "Warnings"}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-green-100 border border-green-300 rounded-full px-2.5 py-1">
              <CheckCircle className="w-3.5 h-3.5 text-green-600" />
              <span className="text-xs font-semibold text-green-700">Ready</span>
            </div>
          )}
        </div>

        {/* Project metadata bar */}
        <div className="flex items-center gap-3 px-4 py-1.5 bg-gray-50 border-b border-gray-100 text-[10px] text-gray-500">
          <span>{projectName || "FPSO P-82 Albacora Leste"}</span>
        </div>

        {/* Condensed safety alert */}
        {hasErrors && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200">
            <OctagonX className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span className="text-xs font-bold text-red-700">UNSAFE — {validationErrors!.length} validation {validationErrors!.length === 1 ? "error" : "errors"} found</span>
          </div>
        )}
        {!hasErrors && hasWarnings && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="text-xs font-bold text-amber-700">{validationWarnings!.length} {validationWarnings!.length === 1 ? "warning" : "warnings"} — review before approval</span>
          </div>
        )}

        {/* Key fields */}
        <div className="px-4 py-3 space-y-1.5">
          {keyFields.map((f, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="text-xs text-gray-400 w-14 flex-shrink-0">{f.label}</span>
              <span className="text-sm text-gray-800">{f.value}</span>
            </div>
          ))}
        </div>

        <div className="px-4 pb-3">
          <div className="w-full border-t border-gray-100" />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg text-white disabled:opacity-50 transition-colors shadow-sm ${
              hasErrors
                ? "bg-red-600 hover:bg-red-700"
                : hasWarnings
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            {downloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {downloading ? "Generating..." : "Download XLSX"}
          </button>
          {/* Push into Generate Valvesheet as a fresh A0 revision */}
          {!hasErrors && <SaveToWorkflowButton vdsCode={vdsCode} data={data} />}
        </div>
      </div>
    </>
  );
}
