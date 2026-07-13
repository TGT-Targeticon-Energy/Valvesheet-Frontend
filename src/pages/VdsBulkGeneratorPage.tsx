import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import {
  Bot, User, Loader2, ExternalLink, ChevronDown, Layers,
  CheckCircle, Circle, XCircle, Send, Trash2, Search,
  ClipboardCopy, RotateCcw, Download, Plus, AlertCircle, FolderArchive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import api, { type VDSSuggestionItem } from "@/services/api";
import ExcelJS from "exceljs";
import {
  VALVE_TYPE_OPTIONS, SEAT_OPTIONS, END_CONNECTION_OPTIONS,
  BORE_OPTIONS, DESIGN_OPTIONS, COMMON_SPECS,
  generateCombinations, countCombinations,
  buildVdsCode, getLabel,
  parsePlainEnglishBulk,
  type VdsFields, type BulkParseResult,
} from "@/lib/vdsParser";

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const WELCOME =
  "Hello! Describe your valve requirements in plain English below â€” I'll parse your input, compute every valid combination, and generate all datasheets at once. You can also fine-tune the selections using the chips that appear after parsing.";

const EXAMPLE_HINTS = [
  "gate and butterfly valve, PTFE seat, A1, raised face",
  "ball valve reduced bore, PEEK and metal seat, T50A, RF and RTJ",
  "all valves, PTFE seat, B1, raised face",
  "needle valve, inline, metal seat, A1, NPT",
];

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type StepStatus = "pending" | "running" | "done" | "error";
interface AgentStep {
  id: string; label: string; status: StepStatus;
  detail?: string; sub?: string;
  progress?: { current: number; total: number };
}

interface BotMsg    { id: string; role: "bot";    text: string }
interface UserMsg   { id: string; role: "user";   text: string; count: number }
interface ResultMsg { id: string; role: "result"; generated: number; failed: number; codes: string[] }
type ChatMessage = BotMsg | UserMsg | ResultMsg;

interface SavedSheet {
  id: string; vdsCode: string; fields: VdsFields;
  completionPct: number; generatedAt: string;
}

// â”€â”€â”€ In-memory session store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Survives SPA navigation (module stays loaded), cleared on page reload / new tab.

const _session = {
  sheets:   [] as SavedSheet[],
  chat:     [] as ChatMessage[],
  batches:  [] as string[][], // each entry = IDs of one generation run
};

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// â”€â”€â”€ Excel export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const bulkFieldDisplayNames: Record<string, string> = {
  piping_class: "Piping Class",
  size_range: "Size Range",
  valve_type: "Valve Type",
  service: "Service",
  valve_standard: "Valve Standard",
  pressure_class: "Pressure Class",
  design_pressure: "Design Pressure",
  corrosion_allowance: "Corrosion Allowance",
  sour_service: "Sour Service Requirements",
  end_connections: "End Connections",
  face_to_face: "Face to Face Dimension",
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
  construction_bonnet: "Bonnet",
  locks: "Locks",
  operation: "Operation",
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
  material_needle_material: "Needle",
  back_seat_material: "Back Seat",
  hinge_pin_material: "Hinge Pin",
  material_cover_material: "Cover",
  "material_hinge/_hinge_pin": "Hinge / Hinge Pin",
  hydrotest_shell: "Hydrotest Shell Test Pressure",
  hydrotest_closure: "Hydrotest Closure Test Pressure",
  pneumatic_test: "Pneumatic LP Test Pressure",
  leakage_rate: "Leakage Rate",
  inspection_testing: "Inspection - Testing",
  material_certification: "Material Certification",
  fire_rating: "Fire Rating",
  marking_purchaser: "Marking - Purchaser's Specification",
  marking_manufacturer: "Marking - Manufacturer",
  finish: "Finish",
};

const bulkConstructionKeys = [
  "body_construction",
  "ball_construction",
  "stem_construction",
  "seat_construction",
  "disc_construction",
  "wedge_construction",
  "shaft_construction",
  "back_seat_construction",
  "packing_construction",
  "bonnet_construction",
  "construction_bonnet",
  "locks",
];

const bulkMaterialKeys = [
  "body_material",
  "ball_material",
  "stem_material",
  "seat_material",
  "seal_material",
  "gland_material",
  "gland_packing",
  "lever_handwheel",
  "spring_material",
  "gaskets",
  "bolts",
  "nuts",
  "disc_material",
  "wedge_material",
  "trim_material",
  "shaft_material",
  "needle_material",
  "material_needle_material",
  "back_seat_material",
  "hinge_pin_material",
  "material_cover_material",
  "material_hinge/_hinge_pin",
];

const bulkStandaloneKeys = [
  "marking_purchaser",
  "marking_manufacturer",
  "inspection_testing",
  "leakage_rate",
  "hydrotest_shell",
  "hydrotest_closure",
  "pneumatic_test",
  "material_certification",
  "fire_rating",
  "finish",
];

function getBulkTitleValveType(rawType: string): string {
  const lower = rawType.toLowerCase();
  if (lower.includes("ball")) return "BALL VALVE";
  if (lower.includes("gate")) return "GATE VALVE";
  if (lower.includes("globe")) return "GLOBE VALVE";
  if (lower.includes("check")) return "CHECK VALVE";
  if (lower.includes("needle")) return "NEEDLE VALVE";
  if (lower.includes("butterfly")) return "BUTTERFLY VALVE";
  if (lower.includes("dbb") || lower.includes("double")) return "DOUBLE BLOCK & BLEED VALVE";
  return "VALVE";
}

async function buildExcelWorksheet(ws: ExcelJS.Worksheet, sheet: SavedSheet) {
  const prediction = await api.getMLPrediction(sheet.vdsCode);
  const data = await api.mergeMaterialsFromAgent(
    sheet.vdsCode,
    { ...(prediction.data || {}) },
    bulkMaterialKeys,
  );

  ws.views = [{ showGridLines: false }];
  ws.columns = [
    { width: 16 },
    { width: 20 },
    { width: 68 },
    { width: 16 },
    { width: 22 },
  ];
  ws.pageSetup = { paperSize: 9, orientation: "portrait" as const, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  ws.headerFooter = {
    oddFooter: "&L40801-SPE-80000-PP-SP-0001&CPage &P of &N&RRev. A",
  };

  const allThinBorders = {
    top: { style: "thin" as const },
    left: { style: "thin" as const },
    bottom: { style: "thin" as const },
    right: { style: "thin" as const },
  };

  const styleRow = (row: number) => {
    for (let col = 1; col <= 5; col += 1) {
      const cell = ws.getCell(row, col);
      cell.border = allThinBorders;
      cell.font = { name: "Calibri", size: 11 };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    }
  };

  const estimateRowHeight = (text: string, charsPerLine: number, minHeight = 26): number => {
    const safe = (text || "").trim();
    if (!safe) return minHeight;
    const lineBreaks = (safe.match(/\n/g) || []).length;
    const wrappedLines = Math.ceil(safe.length / charsPerLine);
    const totalLines = Math.max(1, wrappedLines + lineBreaks);
    return Math.min(240, Math.max(minHeight, totalLines * 15));
  };

  const readValue = (key: string): string => {
    const raw = data[key];
    if (raw === null || raw === undefined) return "-";
    const value = String(raw).trim();
    return value.length > 0 ? value : "-";
  };

  const fieldLabel = (key: string): string =>
    bulkFieldDisplayNames[key] || key.replace(/_/g, " ");

  const writeSimpleRow = (row: number, label: string, value: string, sectionText?: string) => {
    ws.mergeCells(`A${row}:B${row}`);
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`C${row}`).value = value;
    ws.mergeCells(`D${row}:E${row}`);
    styleRow(row);
    ws.getCell(`A${row}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    if (sectionText) ws.getCell(`A${row}`).value = sectionText;
    ws.getRow(row).height = estimateRowHeight(value, 88);
  };

  const writeGroupedSectionRow = (row: number, label: string, value: string) => {
    ws.getCell(`B${row}`).value = label;
    ws.getCell(`C${row}`).value = value;
    ws.mergeCells(`D${row}:E${row}`);
    styleRow(row);
    ws.getRow(row).height = estimateRowHeight(value, 88);
  };

  for (let r = 1; r <= 4; r += 1) styleRow(r);
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 30;
  ws.getRow(3).height = 30;
  ws.getRow(4).height = 24;

  ws.mergeCells("A1:B3");
  ws.mergeCells("C1:C3");
  ws.getCell("C1").value = `${getBulkTitleValveType(readValue("valve_type"))} DATASHEET`;
  ws.getCell("C1").font = { name: "Calibri", size: 24, bold: true };
  ws.getCell("C1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("C1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF2F2F2" },
  };

  ws.getCell("D1").value = "Project:";
  ws.getCell("E1").value = "FPSO P-82 Albacora Leste";
  ws.getCell("D2").value = "Doc No:";
  ws.getCell("E2").value = "40801-SPE-80000-PP-SP-0001";
  ws.getCell("D3").value = "Rev No:";
  ws.getCell("E3").value = "A";
  ["D1", "D2", "D3"].forEach((k) => {
    ws.getCell(k).font = { name: "Calibri", size: 11, bold: true };
    ws.getCell(k).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF2F2F2" },
    };
  });
  ["E1", "E2", "E3"].forEach((k) => {
    ws.getCell(k).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF2F2F2" },
    };
  });

  try {
    let logoRes = await fetch("/excel-logo.png");
    if (!logoRes.ok) logoRes = await fetch("/favicon.png");
    if (logoRes.ok) {
      const logoArrayBuffer = await logoRes.arrayBuffer();
      const bytes = new Uint8Array(logoArrayBuffer);
      let binary = "";
      bytes.forEach((b) => { binary += String.fromCharCode(b); });
      const base64 = btoa(binary);
      const logoId = ws.workbook.addImage({
        base64: `data:image/png;base64,${base64}`,
        extension: "png",
      });
      ws.addImage(logoId, {
        tl: { col: 0.18, row: 0.28 },
        ext: { width: 190, height: 72 },
        editAs: "oneCell",
      });
    }
  } catch {
    // Ignore logo load failures.
  }

  ws.mergeCells("A4:B4");
  ws.getCell("A4").value = "VDS No";
  ws.getCell("C4").value = sheet.vdsCode;
  ["A4", "C4"].forEach((k) => {
    ws.getCell(k).font = { name: "Calibri", size: 11, bold: true };
    ws.getCell(k).alignment = { horizontal: "center", vertical: "middle" };
    ws.getCell(k).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF2F2F2" },
    };
  });

  const basicFields = [
    "piping_class",
    "size_range",
    "valve_type",
    "service",
    "valve_standard",
    "pressure_class",
    "design_pressure",
    "corrosion_allowance",
    "sour_service",
    "end_connections",
    "face_to_face",
  ];

  let row = 5;
  const writtenKeys = new Set<string>();

  basicFields.forEach((key) => {
    const value = readValue(key);
    if (value === "-") return;
    writeSimpleRow(row, fieldLabel(key), value);
    writtenKeys.add(key);
    row += 1;
  });

  const writeSectionRowsFromKeys = (sectionTitle: string, keys: string[]) => {
    const visibleKeys = keys.filter((key) => readValue(key) !== "-");
    if (visibleKeys.length === 0) return;

    const startRow = row;
    visibleKeys.forEach((key) => {
      writeGroupedSectionRow(row, fieldLabel(key), readValue(key));
      writtenKeys.add(key);
      row += 1;
    });

    ws.mergeCells(`A${startRow}:A${row - 1}`);
    const sectionCell = ws.getCell(`A${startRow}`);
    sectionCell.value = sectionTitle;
    sectionCell.font = { name: "Calibri", size: 11, bold: true };
    sectionCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    sectionCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF2F2F2" },
    };
    sectionCell.border = allThinBorders;
  };

  writeSectionRowsFromKeys("Construction", bulkConstructionKeys);

  if (readValue("operation") !== "-") {
    writeSimpleRow(row, "", readValue("operation"), "Operation");
    writtenKeys.add("operation");
    row += 1;
  }

  writeSectionRowsFromKeys("Material", bulkMaterialKeys);

  bulkStandaloneKeys.forEach((key) => {
    if (writtenKeys.has(key) || readValue(key) === "-") return;
    writeSimpleRow(row, fieldLabel(key), readValue(key));
    writtenKeys.add(key);
    row += 1;
  });

  // Notes section — only rendered when backend provides notes
  const notesRaw = readValue("notes");
  const datasheetNotesRaw = readValue("datasheet_notes");
  const notesText = (notesRaw !== "-" ? notesRaw : datasheetNotesRaw !== "-" ? datasheetNotesRaw : "").trim();

  if (notesText) {
    // Notes header
    ws.mergeCells(`A${row}:E${row}`);
    ws.getCell(`A${row}`).value = "NOTES";
    ws.getCell(`A${row}`).font = { name: "Calibri", size: 11, bold: true };
    ws.getCell(`A${row}`).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws.getCell(`A${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    for (let col = 1; col <= 5; col += 1) ws.getCell(row, col).border = allThinBorders;
    ws.getRow(row).height = 24;
    row += 1;

    // Notes body
    ws.mergeCells(`A${row}:E${row}`);
    ws.getCell(`A${row}`).value = notesText;
    ws.getCell(`A${row}`).font = { name: "Calibri", size: 11 };
    ws.getCell(`A${row}`).alignment = { horizontal: "left", vertical: "top", wrapText: true };
    for (let col = 1; col <= 5; col += 1) ws.getCell(row, col).border = allThinBorders;
    ws.getRow(row).height = estimateRowHeight(notesText, 120, 44);
  }
}

async function exportSheetToExcel(sheet: SavedSheet, toast: (o: any) => void) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "VDS Bulk Generator";
  wb.created = new Date();
  await buildExcelWorksheet(wb.addWorksheet(sheet.vdsCode), sheet);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `valve_datasheet_${sheet.vdsCode}.xlsx`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast({ title: "Downloaded!", description: `${sheet.vdsCode}.xlsx saved.` });
}

// â”€â”€â”€ Multi-select chip group â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function MultiChip({
  options, values, onChange, compact = false,
}: { options: { code: string; label: string }[]; values: string[]; onChange: (v: string[]) => void; compact?: boolean }) {
  const toggle = (code: string) =>
    onChange(values.includes(code) ? values.filter((v) => v !== code) : [...values, code]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.code} type="button" onClick={() => toggle(o.code)}
          className={cn(
            "flex items-center gap-1 rounded-full border transition-all select-none",
            compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
            values.includes(o.code)
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent"
          )}>
          {values.includes(o.code) && <CheckCircle className="w-3 h-3 shrink-0" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// â”€â”€â”€ Live suggestion / parse panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ParsePanel({
  parsed, onAddSuggestion, vdsSuggestions, onApplyVds,
}: {
  parsed: BulkParseResult | null;
  onAddSuggestion: (text: string) => void;
  vdsSuggestions: VDSSuggestionItem[];
  onApplyVds: (vds: string) => void;
}) {
  if (!parsed) return null;
  const allOk = parsed.missingRequired.length === 0;

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2.5 text-xs mb-2">
      {/* Detected */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {parsed.valveTypes.length > 0 && (
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">Valve: </span>
            {parsed.valveTypes.map((c) => getLabel(VALVE_TYPE_OPTIONS, c)).join(", ")}
          </span>
        )}
        {parsed.seats.length > 0 && (
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">Seat: </span>
            {parsed.seats.map((c) => getLabel(SEAT_OPTIONS, c)).join(", ")}
          </span>
        )}
        {parsed.spec && (
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">Spec: </span>{parsed.spec}
          </span>
        )}
        {parsed.endConnections.length > 0 && (
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">End: </span>
            {parsed.endConnections.map((c) => getLabel(END_CONNECTION_OPTIONS, c)).join(", ")}
          </span>
        )}
      </div>

      {/* Missing */}
      {parsed.missingRequired.length > 0 && (
        <div className="flex items-center gap-1.5 text-amber-600">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Still need: {parsed.missingRequired.join(", ")}</span>
        </div>
      )}

      {/* Warnings */}
      {parsed.warnings.map((w, i) => (
        <p key={i} className="text-muted-foreground italic">{w}</p>
      ))}

      {/* Quick-add suggestions */}
      {parsed.missingRequired.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <span className="text-muted-foreground self-center">Add:</span>
          {parsed.valveTypes.length === 0 &&
            VALVE_TYPE_OPTIONS.slice(0, 4).map((o) => (
              <button key={o.code} type="button"
                onClick={() => onAddSuggestion(o.label.toLowerCase())}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors">
                <Plus className="w-3 h-3" />{o.label}
              </button>
            ))}
          {parsed.seats.length === 0 &&
            SEAT_OPTIONS.map((o) => (
              <button key={o.code} type="button"
                onClick={() => onAddSuggestion(o.label.toLowerCase() + " seat")}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors">
                <Plus className="w-3 h-3" />{o.label}
              </button>
            ))}
          {!parsed.spec &&
            COMMON_SPECS.slice(0, 4).map((s) => (
              <button key={s} type="button"
                onClick={() => onAddSuggestion("spec " + s)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors">
                <Plus className="w-3 h-3" />Spec {s}
              </button>
            ))}
        </div>
      )}

      {/* VDS API suggestions */}
      {vdsSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5 border-t border-border">
          <span className="text-muted-foreground self-center w-full mb-1">Related VDS templates:</span>
          {vdsSuggestions.slice(0, 8).map((s) => (
            <button key={s.vds} type="button"
              onClick={() => onApplyVds(s.vds)}
              className="px-2 py-0.5 rounded border border-border font-mono text-[11px] text-primary hover:bg-primary/5 transition-colors"
              title={s.description}>
              {s.vds}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Claude-style thinking block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ThinkingBlock({ steps }: { steps: AgentStep[] }) {
  const [open, setOpen] = useState(true);
  const isRunning = steps.some((s) => s.status === "running");
  const hasError  = steps.some((s) => s.status === "error");

  return (
    <div className="rounded-xl border border-border bg-card text-sm overflow-hidden shadow-sm">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/40 transition-colors">
        {isRunning
          ? <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
          : hasError
          ? <XCircle className="w-4 h-4 text-destructive shrink-0" />
          : <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
        <span className="font-semibold text-foreground">
          {isRunning ? "Workingâ€¦" : hasError ? "Completed with some errors" : "All done"}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{open ? "hide" : "show"} details</span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground ml-1 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border/50">
          {steps.map((step) => (
            <div key={step.id} className="flex items-start gap-3 px-5 py-3">
              {step.status === "running"  ? <Loader2      className="w-4 h-4 mt-0.5 shrink-0 animate-spin text-primary" />
             : step.status === "done"    ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-green-500" />
             : step.status === "error"   ? <XCircle      className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
             :                             <Circle       className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground/30" />}
              <div className="flex-1 min-w-0 space-y-1">
                <p className={cn("font-medium", step.status === "pending" ? "text-muted-foreground" : "text-foreground")}>
                  {step.label}
                </p>
                {step.detail && <p className="text-xs text-muted-foreground leading-snug">{step.detail}</p>}
                {step.sub && (
                  <p className="text-[11px] font-mono text-primary/80 bg-primary/5 rounded px-2 py-0.5 inline-block">
                    {step.sub}
                  </p>
                )}
                {step.progress && step.progress.total > 0 && (
                  <div className="space-y-1 pt-0.5">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all duration-200"
                        style={{ width: `${Math.round((step.progress.current / step.progress.total) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {step.progress.current} / {step.progress.total} ({Math.round((step.progress.current / step.progress.total) * 100)}%)
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Message components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function BotMessage({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <p className="flex-1 pt-1.5 text-sm text-foreground leading-relaxed">{text}</p>
    </div>
  );
}

function UserMessage({ text, count }: { text: string; count: number }) {
  return (
    <div className="flex items-start gap-3 justify-end">
      <div className="max-w-[78%] text-right space-y-1">
        <div className="inline-block text-left rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground leading-relaxed">
          {text}
        </div>
        <p className="text-[11px] text-muted-foreground pr-1">
          {count} combination{count !== 1 ? "s" : ""} queued
        </p>
      </div>
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <User className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function ResultMessage({ generated, failed, codes }: { generated: number; failed: number; codes: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const isLarge = codes.length > 5;
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 pt-1.5 space-y-2">
        <p className="text-sm text-foreground leading-relaxed">
          Done! Generated{" "}
          <span className="font-semibold text-green-600">{generated}</span>{" "}
          datasheet{generated !== 1 ? "s" : ""}
          {failed > 0 && <span className="text-muted-foreground"> ({failed} failed â€” the piping spec may not exist in the index)</span>}.{" "}
          {isLarge
            ? "Use the ZIP download in the library panel â†’"
            : "All sheets are saved to your library on the right â€” download them individually as Excel."}
        </p>
        {codes.length > 0 && !isLarge && (
          <div>
            <button onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline">
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
              {expanded ? "Hide" : "Show"} {codes.length} generated codes
            </button>
            {expanded && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {codes.map((c) => (
                  <code key={c} className="px-2 py-0.5 rounded bg-muted border border-border text-xs font-mono text-primary">{c}</code>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// â”€â”€â”€ Sheet card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SheetCard({ sheet, onOpen, onCopy, onDownload, downloading }: {
  sheet: SavedSheet; onOpen: () => void; onCopy: () => void;
  onDownload: () => void; downloading: boolean;
}) {
  const date = new Date(sheet.generatedAt);
  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-2.5 hover:border-primary/30 transition-colors">
      <div className="flex items-center justify-between gap-1">
        <code className="text-sm font-mono font-bold text-primary truncate">{sheet.vdsCode}</code>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onCopy} title="Copy VDS code"
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <ClipboardCopy className="w-3.5 h-3.5" />
          </button>
          <Badge variant="secondary" className="text-[10px] font-mono">{Math.round(sheet.completionPct)}%</Badge>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        {getLabel(VALVE_TYPE_OPTIONS, sheet.fields.valveType)}
        {" Â· "}{getLabel(SEAT_OPTIONS, sheet.fields.seat)}
        {" Â· "}{sheet.fields.spec}
        {" Â· "}{getLabel(END_CONNECTION_OPTIONS, sheet.fields.endConnection ?? "R")}
      </p>

      <p className="text-[10px] text-muted-foreground">
        {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>

      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" className="flex-1 h-7 text-[11px] gap-1" onClick={onOpen}>
          <ExternalLink className="w-3 h-3" /> Open
        </Button>
        <Button size="sm" variant="default" className="flex-1 h-7 text-[11px] gap-1" onClick={onDownload} disabled={downloading}>
          {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          Excel
        </Button>
      </div>
    </div>
  );
}

// â”€â”€â”€ Batch card (shown instead of individual cards when batch > 10) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function BatchCard({ count, generatedAt, onDownload, zipping }: {
  count: number; generatedAt: string; onDownload: () => void; zipping: boolean;
}) {
  const date = new Date(generatedAt);
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <FolderArchive className="w-4 h-4 text-primary shrink-0" />
        <div>
          <p className="text-xs font-semibold text-foreground">{count} sheets generated</p>
          <p className="text-[10px] text-muted-foreground">
            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Large batch â€” download all as a ZIP archive instead of listing individually.
      </p>
      <Button size="sm" variant="default" className="w-full h-8 text-xs gap-1.5"
        onClick={onDownload} disabled={zipping}>
        {zipping
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Building ZIPâ€¦</>
          : <><FolderArchive className="w-3.5 h-3.5" /> Download {count} sheets as ZIP</>}
      </Button>
    </div>
  );
}

// â”€â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function VdsBulkGeneratorPage() {
  const navigate  = useNavigate();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const thinkingRef    = useRef<AgentStep[] | null>(null);

  // â”€â”€ Input state â”€â”€
  const [inputText,  setInputText]  = useState("");
  const [parsed,     setParsed]     = useState<BulkParseResult | null>(null);
  const [vdsSuggs,   setVdsSuggs]   = useState<VDSSuggestionItem[]>([]);
  const [hintIdx,    setHintIdx]    = useState(0);

  // â”€â”€ Available piping specs (loaded from API) â”€â”€
  const [availableSpecs,   setAvailableSpecs]   = useState<string[]>([]);
  const [specsLoading,     setSpecsLoading]     = useState(true);

  // â”€â”€ Adjusted selections â€” nothing is mandatory, all default to ALL â”€â”€
  const [selValveTypes,    setSelValveTypes]    = useState<string[]>(VALVE_TYPE_OPTIONS.map((o) => o.code));
  const [selSeats,         setSelSeats]         = useState<string[]>(SEAT_OPTIONS.map((o) => o.code));
  const [selSpecs,         setSelSpecs]         = useState<string[]>([]);  // filled after API load
  const [selEndConnections,setSelEndConnections]= useState<string[]>(END_CONNECTION_OPTIONS.map((o) => o.code));
  const [selBores,         setSelBores]         = useState<string[]>(BORE_OPTIONS.map((o) => o.code));
  const [selDesigns,       setSelDesigns]       = useState<string[]>(DESIGN_OPTIONS.map((o) => o.code));
  const [spec,             setSpec]             = useState("");
  const [showAdjust,       setShowAdjust]       = useState(false);

  // â”€â”€ Chat + generation state â”€â”€
  const [messages,       setMessages]       = useState<ChatMessage[]>(() =>
    _session.chat.length > 0 ? _session.chat : [{ id: "w0", role: "bot", text: WELCOME }]
  );
  const [thinkingSteps,  setThinkingSteps]  = useState<AgentStep[] | null>(null);
  const [isGenerating,   setIsGenerating]   = useState(false);

  // â”€â”€ Saved sheets â”€â”€
  const [savedSheets,    setSavedSheets]    = useState<SavedSheet[]>(() => _session.sheets);
  const [sheetSearch,    setSheetSearch]    = useState("");
  const [downloadingId,  setDownloadingId]  = useState<string | null>(null);
  const [batches,        setBatches]        = useState<string[][]>(() => _session.batches);
  const [zipping,        setZipping]        = useState(false);

  // â”€â”€ Load available piping specs from backend â”€â”€
  useEffect(() => {
    api.getPipingClasses()
      .then(({ piping_classes }) => {
        setAvailableSpecs(piping_classes);
        setSelSpecs(piping_classes); // all selected by default
      })
      .catch(() => {
        // Fallback to common specs if API unavailable
        setAvailableSpecs(COMMON_SPECS);
        setSelSpecs(COMMON_SPECS);
      })
      .finally(() => setSpecsLoading(false));
  }, []);

  // â”€â”€ Sync to in-memory session store (survives SPA nav, cleared on reload) â”€â”€
  useEffect(() => { _session.chat     = messages;    }, [messages]);
  useEffect(() => { _session.sheets   = savedSheets; }, [savedSheets]);
  useEffect(() => { _session.batches  = batches; }, [batches]);
  useEffect(() => { thinkingRef.current = thinkingSteps; }, [thinkingSteps]);

  // â”€â”€ Auto-scroll â”€â”€
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingSteps]);

  // â”€â”€ Cycle hint text â”€â”€
  useEffect(() => {
    const t = setInterval(() => setHintIdx((i) => (i + 1) % EXAMPLE_HINTS.length), 4000);
    return () => clearInterval(t);
  }, []);

  // â”€â”€ Textarea auto-grow â”€â”€
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  // â”€â”€ Live parse on input change (debounced 150ms) â”€â”€
  useEffect(() => {
    if (!inputText.trim()) { setParsed(null); return; }
    const t = setTimeout(() => {
      const result = parsePlainEnglishBulk(inputText);
      setParsed(result);
      // Mirror into chip state
      setSelValveTypes(result.valveTypes);
      setSelSeats(result.seats);
      setSelEndConnections(result.endConnections);
      if (result.bores.length > 0)   setSelBores(result.bores);
      if (result.designs.length > 0) setSelDesigns(result.designs);
      // Keyword group detected (e.g. "tubing" â†’ T50Aâ€¦T60C)
      if (result.specs && result.specs.length > 0) {
        setSelSpecs(result.specs);
        setSpec("");
      } else if (result.spec) {
        // Exact spec code typed â€” narrow to just that one
        setSelSpecs([result.spec]);
        setSpec(result.spec);
      } else {
        // No spec typed â†’ keep all available specs selected
        setSelSpecs(availableSpecs);
        setSpec("");
      }
    }, 150);
    return () => clearTimeout(t);
  }, [inputText]);

  // â”€â”€ VDS API suggestions (debounced 500ms) â”€â”€
  useEffect(() => {
    if (!inputText.trim() || inputText.length < 3) { setVdsSuggs([]); return; }
    const t = setTimeout(async () => {
      try {
        // Build a partial VDS prefix from what's been parsed
        const p = parsePlainEnglishBulk(inputText);
        if (p.valveTypes.length > 0 && p.spec) {
          const prefix = p.valveTypes[0] + (p.seats[0] ?? "") + p.spec;
          const res = await api.getVdsSuggestions(prefix, 8);
          setVdsSuggs(res.suggestions);
        }
      } catch { setVdsSuggs([]); }
    }, 500);
    return () => clearTimeout(t);
  }, [inputText]);

  // â”€â”€ Word-level autocomplete (shows suggestions for the word currently being typed) â”€â”€
  const wordSuggestions = useMemo(() => {
    if (!inputText) return [];
    const lastWord = inputText.match(/([a-zA-Z]+)$/)?.[1] ?? "";
    if (lastWord.length < 2) return [];
    const w = lastWord.toLowerCase();
    const results: { label: string; insert: string }[] = [];

    VALVE_TYPE_OPTIONS.forEach((o) => {
      if (o.label.toLowerCase().includes(w) && !inputText.toLowerCase().includes(o.label.toLowerCase().split(" ")[0]))
        results.push({ label: o.label, insert: o.label.toLowerCase() });
    });
    SEAT_OPTIONS.forEach((o) => {
      if (o.label.toLowerCase().startsWith(w) && !inputText.toLowerCase().includes(o.label.toLowerCase()))
        results.push({ label: o.label + " seat", insert: o.label.toLowerCase() + " seat" });
    });
    END_CONNECTION_OPTIONS.forEach((o) => {
      const firstWord = o.label.toLowerCase().split(" ")[0];
      if (firstWord.startsWith(w) && !inputText.toLowerCase().includes(firstWord))
        results.push({ label: o.label, insert: o.label.toLowerCase().replace(/\s*\(.*\)/, "") });
    });
    return results.slice(0, 5);
  }, [inputText]);

  // â”€â”€ Combination count â”€â”€
  const combinationCount = useMemo(
    () => countCombinations(selValveTypes, selSeats, selEndConnections, selBores, selDesigns, selSpecs.length || 1, selSpecs),
    [selValveTypes, selSeats, selEndConnections, selBores, selDesigns, selSpecs]
  );

  // â”€â”€ Append suggestion text â”€â”€
  const appendSuggestion = useCallback((text: string) => {
    const sep = inputText.trim().endsWith(",") ? " " : inputText.trim() ? ", " : "";
    const next = inputText + sep + text;
    setInputText(next);
    textareaRef.current?.focus();
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
      }
    }, 10);
  }, [inputText]);

  // â”€â”€ Apply a VDS suggestion from API â”€â”€
  const applyVdsSuggestion = (vds: string) => {
    toast({ title: `VDS template: ${vds}`, description: "Opening in Generatorâ€¦" });
    navigate("/generator", { state: { vdsNumber: vds } });
  };

  // â”€â”€ Step updater â”€â”€
  const updateStep = useCallback((id: string, patch: Partial<AgentStep>) => {
    setThinkingSteps((prev) => prev ? prev.map((s) => s.id === id ? { ...s, ...patch } : s) : prev);
  }, []);

  // â”€â”€ Main generate â”€â”€
  const handleGenerate = async () => {
    if (combinationCount === 0 || isGenerating) return;
    const activeSpecs = selSpecs.length > 0 ? selSpecs : availableSpecs;

    const userText = inputText.trim() || `${selValveTypes.map((c) => getLabel(VALVE_TYPE_OPTIONS, c)).join(", ")}, ${selSeats.map((c) => getLabel(SEAT_OPTIONS, c)).join(", ")} seat, ${activeSpecs.length} spec${activeSpecs.length !== 1 ? "s" : ""}`;
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: userText, count: combinationCount }]);
    setInputText("");
    setParsed(null);
    setVdsSuggs([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const steps: AgentStep[] = [
      { id: "parse",    label: "Parsing your input",          status: "running" },
      { id: "matrix",   label: "Building combination matrix", status: "pending" },
      { id: "generate", label: "Generating datasheets",       status: "pending", progress: { current: 0, total: 0 } },
      { id: "save",     label: "Saving to your library",      status: "pending" },
    ];
    setThinkingSteps(steps);
    setIsGenerating(true);

    // Step 1 â€” parse
    await delay(350);
    updateStep("parse", {
      status: "done",
      detail: `${selValveTypes.length} valve type${selValveTypes.length > 1 ? "s" : ""} Â· ${selSeats.length} seat${selSeats.length > 1 ? "s" : ""} Â· ${activeSpecs.length} spec${activeSpecs.length !== 1 ? "s" : ""} Â· ${selEndConnections.length} end connection${selEndConnections.length > 1 ? "s" : ""}`,
    });
    updateStep("matrix", { status: "running" });

    // Step 2 â€” build matrix
    await delay(250);
    const combos = generateCombinations(selValveTypes, selSeats, activeSpecs, selEndConnections, selBores, selDesigns);

    // Build valid (code, fields) pairs â€” skip anything buildVdsCode rejects
    const validPairs: { code: string; fields: VdsFields }[] = [];
    const comboByCode = new Map<string, VdsFields>();
    for (const combo of combos) {
      const { vdsCode, errors } = buildVdsCode(combo);
      if (!errors.length && vdsCode && !comboByCode.has(vdsCode)) {
        validPairs.push({ code: vdsCode, fields: combo });
        comboByCode.set(vdsCode, combo);
      }
    }

    updateStep("matrix", {
      status: "done",
      detail: `${validPairs.length} unique combination${validPairs.length !== 1 ? "s" : ""} identified`,
    });
    updateStep("generate", { status: "running", progress: { current: 0, total: validPairs.length } });

    // Step 3 â€” generate via ML predict (parallel chunks of 5 for speed)
    const newSheets: SavedSheet[] = [];
    const okCodes: string[] = [];
    let failed = 0;
    const CHUNK = 5;

    for (let i = 0; i < validPairs.length; i += CHUNK) {
      const chunk = validPairs.slice(i, i + CHUNK);

      updateStep("generate", {
        sub: `Processing ${i + 1}â€“${Math.min(i + CHUNK, validPairs.length)} of ${validPairs.length}â€¦`,
        progress: { current: i, total: validPairs.length },
      });

      const results = await Promise.allSettled(
        chunk.map((p) => api.getMLPrediction(p.code))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const pair = chunk[j];
        if (result.status === "fulfilled") {
          const ml = result.value;
          const values = Object.values(ml.data ?? {});
          const populated = values.filter((v) => v && String(v).trim() !== "").length;
          const completionPct = values.length > 0 ? (populated / values.length) * 100 : 0;
          newSheets.push({
            id: `${pair.code}-${Date.now()}-${i + j}`,
            vdsCode: pair.code,
            fields: pair.fields,
            completionPct,
            generatedAt: new Date().toISOString(),
          });
          okCodes.push(pair.code);
        } else {
          failed++;
        }
      }

      updateStep("generate", { progress: { current: Math.min(i + CHUNK, validPairs.length), total: validPairs.length } });
    }

    // Step 4 â€” save
    updateStep("generate", {
      status: failed > 0 && okCodes.length === 0 ? "error" : "done",
      detail: `${okCodes.length} generated Â· ${failed} failed`,
      sub: undefined,
    });
    updateStep("save", { status: "running" });
    await delay(250);
    const orderedSheets = [...newSheets].reverse();
    setSavedSheets((prev) => [...orderedSheets, ...prev]);
    setBatches((prev) => [...prev, orderedSheets.map((s) => s.id)]);
    updateStep("save", { status: "done", detail: `${newSheets.length} sheet${newSheets.length !== 1 ? "s" : ""} added to your library` });

    await delay(150);
    setMessages((prev) => [...prev, {
      id: `r-${Date.now()}`, role: "result",
      generated: newSheets.length, failed, codes: okCodes,
    }]);
    setThinkingSteps(null);
    setIsGenerating(false);
  };

  // â”€â”€ ZIP download for last batch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const downloadBatchAsZip = async (batchIds: string[]) => {
    const batchSheets = savedSheets.filter((s) => batchIds.includes(s.id));
    if (batchSheets.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      for (const sheet of batchSheets) {
        try {
          const wb = new ExcelJS.Workbook();
          wb.creator = "VDS Bulk Generator";
          await buildExcelWorksheet(wb.addWorksheet(sheet.vdsCode), sheet);
          const buf = await wb.xlsx.writeBuffer();
          zip.file(`${sheet.vdsCode}_datasheet.xlsx`, buf);
        } catch { /* skip failed sheet */ }
      }

      const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VDS_Batch_${new Date().toISOString().slice(0, 10)}_${batchSheets.length}sheets.zip`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      toast({ title: "ZIP downloaded!", description: `${batchSheets.length} Excel files in one archive.` });
    } catch {
      toast({ title: "ZIP failed", description: "Could not create archive.", variant: "destructive" });
    } finally {
      setZipping(false);
    }
  };

  const hasBallValve   = selValveTypes.includes("BL");
  const hasNeedleValve = selValveTypes.includes("NE");

  // Every batch with > 5 sheets gets a ZIP card; smaller ones stay as individual cards
  const largeBatches = useMemo(() => batches.filter((b) => b.length > 5), [batches]);
  const largeBatchIdSet = useMemo(() => new Set(largeBatches.flat()), [largeBatches]);

  // Exclude sheets that belong to any large batch from the individual listing
  const filteredSheets = useMemo(() => {
    const base = savedSheets.filter((s) => !largeBatchIdSet.has(s.id));
    if (!sheetSearch.trim()) return base;
    const q = sheetSearch.toUpperCase();
    return base.filter((s) => s.vdsCode.includes(q) || s.fields.spec.includes(q));
  }, [savedSheets, sheetSearch, largeBatchIdSet]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">

      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Layers className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-semibold">Bulk VDS Generator</h1>
          <span className="hidden sm:block text-xs text-muted-foreground">Â· Natural language â†’ all combinations</span>
        </div>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground"
          onClick={() => { setMessages([{ id: "w-new", role: "bot", text: WELCOME }]); toast({ title: "Chat cleared" }); }}>
          <RotateCcw className="w-3.5 h-3.5" /> Clear chat
        </Button>
      </div>

      {/* â”€â”€ Body â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex-1 flex overflow-hidden">

        {/* â”€â”€ Chat column â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-6">
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg) =>
                msg.role === "bot"    ? <BotMessage    key={msg.id} text={msg.text} /> :
                msg.role === "user"   ? <UserMessage   key={msg.id} text={msg.text} count={msg.count} /> :
                msg.role === "result" ? <ResultMessage key={msg.id} generated={msg.generated} failed={msg.failed} codes={msg.codes} /> :
                null
              )}

              {/* Live thinking block */}
              {thinkingSteps && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1"><ThinkingBlock steps={thinkingSteps} /></div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* â”€â”€ Input area â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="shrink-0 border-t border-border bg-card p-4">
            <div className="max-w-3xl mx-auto space-y-2">

              {/* Live parse panel */}
              {parsed && (
                <ParsePanel
                  parsed={parsed}
                  onAddSuggestion={appendSuggestion}
                  vdsSuggestions={vdsSuggs}
                  onApplyVds={applyVdsSuggestion}
                />
              )}

              {/* Manual adjust toggle */}
              {parsed && (
                <button type="button" onClick={() => setShowAdjust((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showAdjust && "rotate-180")} />
                  Adjust selections manually
                </button>
              )}

              {/* Manual chip adjustments */}
              {showAdjust && (
                <div className="rounded-xl border border-border bg-background p-3 space-y-3 text-xs">
                  <div className="space-y-1">
                    <span className="font-medium text-muted-foreground uppercase tracking-widest text-[10px]">Valve Types</span>
                    <MultiChip options={VALVE_TYPE_OPTIONS} values={selValveTypes} onChange={setSelValveTypes} compact />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="font-medium text-muted-foreground uppercase tracking-widest text-[10px]">Seat</span>
                      <MultiChip options={SEAT_OPTIONS} values={selSeats} onChange={setSelSeats} compact />
                    </div>
                    <div className="space-y-1">
                      <span className="font-medium text-muted-foreground uppercase tracking-widest text-[10px]">End Connection</span>
                      <MultiChip options={END_CONNECTION_OPTIONS} values={selEndConnections} onChange={setSelEndConnections} compact />
                    </div>
                    {hasBallValve && (
                      <div className="space-y-1">
                        <span className="font-medium text-muted-foreground uppercase tracking-widest text-[10px]">Bore</span>
                        <MultiChip options={BORE_OPTIONS} values={selBores} onChange={setSelBores} compact />
                      </div>
                    )}
                    {hasNeedleValve && (
                      <div className="space-y-1">
                        <span className="font-medium text-muted-foreground uppercase tracking-widest text-[10px]">Design</span>
                        <MultiChip options={DESIGN_OPTIONS} values={selDesigns} onChange={setSelDesigns} compact />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-muted-foreground uppercase tracking-widest text-[10px]">
                        Piping Specs {specsLoading && <span className="normal-case">(loadingâ€¦)</span>}
                      </span>
                      <div className="flex gap-2">
                        <button type="button" className="text-[10px] text-primary hover:underline"
                          onClick={() => setSelSpecs(availableSpecs)}>All</button>
                        <button type="button" className="text-[10px] text-primary hover:underline"
                          onClick={() => setSelSpecs([])}>None</button>
                      </div>
                    </div>
                    <MultiChip
                      options={availableSpecs.map((s) => ({ code: s, label: s }))}
                      values={selSpecs}
                      onChange={setSelSpecs}
                      compact
                    />
                  </div>
                </div>
              )}

              {/* Word autocomplete chips â€” appear while typing a partial keyword */}
              {wordSuggestions.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap py-1">
                  <span className="text-[11px] text-muted-foreground shrink-0">Complete:</span>
                  {wordSuggestions.map((s) => (
                    <button key={s.insert} type="button"
                      onMouseDown={(e) => {
                        e.preventDefault(); // prevent textarea blur
                        // Replace the partial last word with the full suggestion
                        const withoutLastWord = inputText.replace(/([a-zA-Z]+)$/, "");
                        const sep = withoutLastWord.trim() && !withoutLastWord.trim().endsWith(",") ? ", " : "";
                        appendSuggestion.call(null, ""); // no-op; directly set:
                        const next = withoutLastWord.trimEnd() + sep + s.insert;
                        setInputText(next);
                        setTimeout(() => {
                          if (textareaRef.current) {
                            textareaRef.current.style.height = "auto";
                            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
                            textareaRef.current.focus();
                          }
                        }, 10);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary font-medium hover:bg-primary/20 transition-colors">
                      <Plus className="w-3 h-3" />{s.label}
                    </button>
                  ))}
                </div>
              )}

              {/* ChatGPT-style textarea container */}
              <div className="relative rounded-2xl border border-border bg-background shadow-sm focus-within:border-primary/50 focus-within:shadow-md transition-all">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !isGenerating) {
                      e.preventDefault(); handleGenerate();
                    }
                  }}
                  placeholder={`Try: "${EXAMPLE_HINTS[hintIdx]}"`}
                  rows={1}
                  disabled={isGenerating}
                  className="w-full resize-none bg-transparent px-4 pt-3.5 pb-12 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none leading-relaxed"
                  style={{ minHeight: "52px", maxHeight: "160px" }}
                />
                {/* Bottom bar inside textarea */}
                <div className="absolute bottom-2 left-3 right-3 flex items-center justify-end">
                  <Button
                    size="sm" onClick={handleGenerate}
                    disabled={isGenerating || specsLoading || combinationCount === 0}
                    className="h-7 px-3 gap-1.5 rounded-xl">
                    {isGenerating
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Send className="w-3.5 h-3.5" />}
                    Generate All
                  </Button>
                </div>
              </div>

              <p className="text-[11px] text-center text-muted-foreground">
                Press <kbd className="px-1.5 py-0.5 rounded border border-border text-[10px] font-mono">Enter</kbd> to generate Â· <kbd className="px-1.5 py-0.5 rounded border border-border text-[10px] font-mono">Shift+Enter</kbd> for new line
              </p>
            </div>
          </div>
        </div>

        {/* â”€â”€ Saved sheets panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="w-[17rem] shrink-0 border-l border-border flex flex-col bg-card">
          <div className="px-4 py-3 border-b border-border space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide">Library</h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">Saved across sessions Â· Excel download</p>
              </div>
              <div className="flex items-center gap-1.5">
                {savedSheets.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">{savedSheets.length}</Badge>
                )}
                {savedSheets.length > 0 && (
                  <button onClick={() => { setSavedSheets([]); setBatches([]); toast({ title: "Library cleared" }); }}
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Clear all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {filteredSheets.length > 4 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input placeholder="Searchâ€¦" value={sheetSearch}
                  onChange={(e) => setSheetSearch(e.target.value.toUpperCase())}
                  className="h-7 pl-8 text-xs" />
              </div>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {/* One BatchCard per large batch (> 5 sheets) */}
              {largeBatches.map((batchIds, i) => {
                const first = savedSheets.find((s) => batchIds.includes(s.id));
                return (
                  <BatchCard
                    key={i}
                    count={batchIds.length}
                    generatedAt={first?.generatedAt ?? new Date().toISOString()}
                    onDownload={() => downloadBatchAsZip(batchIds)}
                    zipping={zipping}
                  />
                );
              })}

              {filteredSheets.length === 0 && largeBatches.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 px-4 text-center">
                  <Layers className="w-8 h-8 text-muted-foreground/20 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {savedSheets.length === 0
                      ? "No sheets yet. Describe your valves above and hit Generate."
                      : "No results for that search."}
                  </p>
                </div>
              ) : (
                filteredSheets.map((sheet) => (
                  <SheetCard
                    key={sheet.id}
                    sheet={sheet}
                    downloading={downloadingId === sheet.id}
                    onOpen={() => navigate("/generator", { state: { vdsNumber: sheet.vdsCode } })}
                    onCopy={() => { navigator.clipboard.writeText(sheet.vdsCode); toast({ title: `Copied ${sheet.vdsCode}` }); }}
                    onDownload={async () => {
                      setDownloadingId(sheet.id);
                      try { await exportSheetToExcel(sheet, toast); }
                      catch { toast({ title: "Download failed", variant: "destructive" }); }
                      finally { setDownloadingId(null); }
                    }}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

