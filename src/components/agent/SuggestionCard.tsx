/**
 * SuggestionCard — Clickable valve suggestion cards with specs.
 *
 * Features:
 * - Each card shows key valve specs (type, class, material, size, ends)
 * - Click a card to preview full datasheet in a popup modal
 * - Checkbox multi-select for bulk download
 * - ≤5 selected → single XLSX workbook with multiple sheets
 * - >5 selected → ZIP archive with individual XLSX files
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  FileSpreadsheet,
  ArrowRight,
  Wrench,
  Beaker,
  Zap,
  Shield,
  Ruler,
  Cable,
  Download,
  Loader2,
  CheckSquare,
  Square,
  PackageOpen,
  Eye,
  X,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { downloadBulkDatasheets, downloadSingleDatasheet, type DatasheetInput } from "@/lib/excelBuilder";
import { constructionOrderFor, materialOrderFor } from "@/lib/fieldOrders";

// Fields that must NEVER appear in the preview body or "Other" group.
const EXCLUDED_PREVIEW_KEYS = new Set<string>([
  "vds_no", "nace_compliant", "low_temperature", "min_design_temp", "design_code",
]);

export interface SuggestionItem {
  type: string;
  title: string;
  description: string;
  action: Record<string, any>;
  meta?: {
    valve_type?: string;
    piping_class?: string;
    pressure_class?: string;
    size_range?: string;
    body_material?: string;
    end_connections?: string;
    sour_service?: string;
  };
}

interface SuggestionCardProps {
  suggestions: SuggestionItem[];
  onSelect: (suggestion: SuggestionItem) => void;
  sessionId?: string;
}

// ── Field display names (mirrored from excelBuilder for modal display) ──

const FIELD_NAMES: Record<string, string> = {
  valve_type: "Valve Type",
  piping_class: "Piping Class",
  size_range: "Size Range",
  valve_standard: "Valve Standard",
  pressure_class: "Pressure Class",
  design_pressure: "Design Pressure",
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
        "pressure_class", "design_pressure", "corrosion_allowance", "sour_service",
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
  const shaft = String(data.shaft_material || "").trim();
  const stem = String(data.stem_material || "").trim();
  const isButterflyLayout =
    valveType.includes("butterfly") || (shaft.length > 0 && stem.length === 0);
  if (isButterflyLayout) hidden.add("spring_material");
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

// ── Preview Modal ──

interface PreviewModalProps {
  vdsCode: string;
  sessionId?: string;
  onClose: () => void;
}

function PreviewModal({ vdsCode, sessionId, onClose }: PreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, string> | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const agentApiUrl = import.meta.env.VITE_AGENT_API_URL || "http://localhost:8001/api";
        const resp = await fetch(
          `${agentApiUrl}/datasheets/${encodeURIComponent(vdsCode)}?chat_ui=true`,
        );
        if (!resp.ok) throw new Error(`Failed to load datasheet (${resp.status})`);
        const json = await resp.json();
        if (!cancelled) {
          setData(json.datasheet || json.data || {});
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [vdsCode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleDownload = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await downloadSingleDatasheet({ vdsCode, data }, sessionId);
    } finally {
      setDownloading(false);
    }
  };

  const filledCount = data ? Object.values(data).filter((v) => v && v !== "-" && v.trim()).length : 0;
  const totalCount = data ? Object.keys(data).length : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-[95vw] max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-indigo-600 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-white/90" />
            <span className="font-mono font-bold text-lg text-white tracking-wide">{vdsCode}</span>
            {!loading && data && (
              <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-2.5 py-1">
                <CheckCircle className="w-3.5 h-3.5 text-green-300" />
                <span className="text-xs font-semibold text-white">Ready</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!loading && data && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/20 text-white hover:bg-white/30 disabled:opacity-50 transition-colors"
              >
                {downloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {downloading ? "Generating..." : "Download XLSX"}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="text-sm text-gray-500">Loading datasheet...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {!loading && data && (
            <div className="space-y-5">
              {/* Field count */}
              <div>
                <span className="text-xs text-gray-500">{filledCount} of {totalCount} fields populated</span>
              </div>

              {/* Sections */}
              {buildSectionGroups(data).map((section) => {
                const hiddenKeys = valveTypeHiddenKeys(data);
                const rows = section.keys
                  .filter((key) => !hiddenKeys.has(key) && !EXCLUDED_PREVIEW_KEYS.has(key))
                  .filter((key) => data[key] && data[key] !== "-" && data[key].trim())
                  .map((key) => ({ key, label: FIELD_NAMES[key] || key, value: data[key] }));
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

              {/* Notes section — LAST. Sourced from data.notes (per-VDS notes from xlsm A0). */}
              {(() => {
                const notes = (data.notes || "").trim();
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
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Type configs ──

const TYPE_CONFIG: Record<
  string,
  {
    icon: typeof Zap;
    gradient: string;
    border: string;
    hoverBorder: string;
    accent: string;
  }
> = {
  combination: {
    icon: FileSpreadsheet,
    gradient: "from-amber-50 to-indigo-50",
    border: "border-amber-200/70",
    hoverBorder: "hover:border-amber-400",
    accent: "text-amber-600",
  },
  fix: {
    icon: Wrench,
    gradient: "from-amber-50 to-orange-50",
    border: "border-amber-200/70",
    hoverBorder: "hover:border-amber-400",
    accent: "text-amber-600",
  },
  material: {
    icon: Beaker,
    gradient: "from-emerald-50 to-teal-50",
    border: "border-emerald-200/70",
    hoverBorder: "hover:border-emerald-400",
    accent: "text-emerald-600",
  },
  spec: {
    icon: Zap,
    gradient: "from-purple-50 to-violet-50",
    border: "border-purple-200/70",
    hoverBorder: "hover:border-purple-400",
    accent: "text-purple-600",
  },
  info: {
    icon: ArrowRight,
    gradient: "from-gray-50 to-slate-50",
    border: "border-gray-200/70",
    hoverBorder: "hover:border-gray-400",
    accent: "text-gray-600",
  },
};

function SpecRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
}) {
  if (!value || value === "-") return null;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Icon className="w-3 h-3 text-gray-400 flex-shrink-0" />
      <span className="text-[11px] text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-[11px] text-gray-600 truncate">{value}</span>
    </div>
  );
}

const AGENT_API_URL =
  import.meta.env.VITE_AGENT_API_URL || "http://localhost:8000/api";

export function SuggestionCard({
  suggestions,
  onSelect,
  sessionId,
}: SuggestionCardProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [previewCode, setPreviewCode] = useState<string | null>(null);

  if (!suggestions.length) return null;

  // Check if suggestions have valve specs for rich cards
  const hasSpecs = suggestions.some((s) => s.meta?.valve_type);

  const toggleSelect = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === suggestions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(suggestions.map((s) => s.action?.vds_code || s.title)));
    }
  };

  const handleBulkDownload = async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    try {
      // Fetch full datasheet data for each selected VDS code
      const codes = Array.from(selected);
      const inputs: DatasheetInput[] = [];

      // Use batch endpoint for efficiency
      const resp = await fetch(`${AGENT_API_URL}/datasheets/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(codes),
      });

      if (resp.ok) {
        const batch = await resp.json();
        for (const result of batch.results || []) {
          if (result.status === "success" && result.data) {
            inputs.push({
              vdsCode: result.vds_code,
              data: result.data,
            });
          }
        }
      } else {
        // Fallback: fetch individually
        for (const code of codes) {
          try {
            const r = await fetch(`${AGENT_API_URL}/datasheets/${code}?chat_ui=true`);
            if (r.ok) {
              const d = await r.json();
              inputs.push({
                vdsCode: d.vds_code,
                data: d.datasheet,
              });
            }
          } catch { /* skip failed */ }
        }
      }

      if (inputs.length > 0) {
        await downloadBulkDatasheets(inputs, sessionId);
      }
    } finally {
      setDownloading(false);
    }
  };

  // ── Pill layout for non-valve suggestions ──
  if (!hasSpecs) {
    return (
      <div className="my-3">
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s, i) => {
            const config = TYPE_CONFIG[s.type] ?? TYPE_CONFIG.combination;
            const Icon = config.icon;
            return (
              <button
                key={i}
                onClick={() => onSelect(s)}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2 rounded-full border",
                  "text-left transition-all duration-150 cursor-pointer",
                  "shadow-sm hover:shadow-md active:scale-[0.98]",
                  `bg-gradient-to-r ${config.gradient}`,
                  config.border,
                  config.hoverBorder,
                )}
              >
                <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", config.accent)} />
                <span className="text-sm font-medium text-gray-900">{s.title}</span>
                {s.description && s.description.length <= 50 && (
                  <span className="text-xs text-gray-500 hidden sm:inline truncate max-w-[180px]">
                    {s.description}
                  </span>
                )}
                <ArrowRight className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Rich card layout for valve suggestions with multi-select ──
  return (
    <div className="my-3 space-y-2">
      {/* Preview modal */}
      {previewCode && (
        <PreviewModal
          vdsCode={previewCode}
          sessionId={sessionId}
          onClose={() => setPreviewCode(null)}
        />
      )}

      {/* Header with select all + download */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            {suggestions.length} matching valve{suggestions.length !== 1 ? "s" : ""}
          </p>
          <button
            onClick={toggleAll}
            className="flex items-center gap-1 text-[11px] text-amber-500 hover:text-amber-700 transition-colors"
          >
            {selected.size === suggestions.length ? (
              <CheckSquare className="w-3.5 h-3.5" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            {selected.size === suggestions.length ? "Deselect all" : "Select all"}
          </button>
        </div>

        {selected.size > 0 && (
          <button
            onClick={handleBulkDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {downloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : selected.size > 5 ? (
              <PackageOpen className="w-3.5 h-3.5" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {downloading
              ? "Generating..."
              : selected.size > 5
                ? `Download ZIP (${selected.size})`
                : selected.size === 1
                  ? "Download XLSX"
                  : `Download ${selected.size} sheets`}
          </button>
        )}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {suggestions.map((s, i) => {
          const config = TYPE_CONFIG[s.type] ?? TYPE_CONFIG.combination;
          const Icon = config.icon;
          const m = s.meta || {};
          const code = s.action?.vds_code || s.title;
          const isSelected = selected.has(code);

          return (
            <div
              key={i}
              className={cn(
                "group relative text-left rounded-xl border p-3 transition-all duration-200",
                "shadow-sm hover:shadow-lg",
                `bg-gradient-to-br ${config.gradient}`,
                isSelected
                  ? "border-amber-400 ring-2 ring-amber-200"
                  : config.border,
                config.hoverBorder,
              )}
            >
              {/* Checkbox */}
              <button
                onClick={(e) => toggleSelect(code, e)}
                className={cn(
                  "absolute top-2 right-2 p-0.5 rounded transition-colors z-10",
                  isSelected
                    ? "text-amber-600"
                    : "text-gray-300 hover:text-gray-500",
                )}
              >
                {isSelected ? (
                  <CheckSquare className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>

              {/* Clickable area (opens preview popup) */}
              <button
                onClick={() => setPreviewCode(code)}
                className="w-full text-left cursor-pointer active:scale-[0.98]"
              >
                {/* Header: VDS code + eye icon */}
                <div className="flex items-center justify-between mb-2 pr-6">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("w-4 h-4 flex-shrink-0", config.accent)} />
                    <span className="font-mono font-bold text-sm text-gray-900 tracking-wide">
                      {s.title}
                    </span>
                  </div>
                  <Eye
                    className={cn(
                      "w-4 h-4 transition-all duration-200 flex-shrink-0",
                      "text-gray-300 group-hover:text-amber-500",
                    )}
                  />
                </div>

                {/* Valve type label */}
                {m.valve_type && (
                  <p className="text-xs font-medium text-gray-700 mb-1.5 truncate">
                    {m.valve_type}
                  </p>
                )}

                {/* Spec details */}
                <div className="space-y-0.5">
                  <SpecRow icon={Shield} label="Class" value={m.pressure_class || m.piping_class || ""} />
                  <SpecRow
                    icon={Beaker}
                    label="Material"
                    value={
                      m.body_material && m.body_material.length > 35
                        ? m.body_material.slice(0, 35) + "..."
                        : m.body_material || ""
                    }
                  />
                  <SpecRow icon={Ruler} label="Size" value={m.size_range || ""} />
                  <SpecRow icon={Cable} label="Ends" value={m.end_connections || ""} />
                  {m.sour_service && m.sour_service !== "-" && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                        NACE
                      </span>
                    </div>
                  )}
                </div>
              </button>

              {/* Hover glow effect */}
              <div className="absolute inset-0 rounded-xl ring-2 ring-transparent group-hover:ring-amber-300/50 transition-all duration-200 pointer-events-none" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
