/**
 * Professional Valve Datasheet Excel Builder
 *
 * Creates industry-grade XLSX datasheets with:
 * - Company logo header
 * - Sectioned layout (Basic Info, Construction, Materials, Testing, Compliance)
 * - Auto-sized rows, merged section headers, thin borders
 * - Multi-sheet workbook support
 * - ZIP archive for bulk downloads (>5 sheets)
 *
 * Used by: DatasheetCard, SuggestionCard bulk download, AgentChatPage
 */

import ExcelJS from "exceljs";
import JSZip from "jszip";
import { saveDownload } from "@/services/agentApi";
import { constructionOrderFor, materialOrderFor } from "./fieldOrders";

const FIELD_NAMES: Record<string, string> = {
  valve_type: "Valve Type",
  piping_class: "Piping Class",
  size_range: "Size Range",
  valve_standard: "Valve Standard",
  pressure_class: "Pressure Class",
  design_pressure: "Design Pressure",
  design_temperature: "Design Temperature",
  corrosion_allowance: "Corrosion Allowance",
  material_class: "Material Class",
  sour_service: "Sour Service",
  end_connections: "End Connections",
  face_to_face: "Face to Face",
  flange_material: "Flange Material",
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

const BASIC_FIELDS = [
  "piping_class", "material_class", "size_range", "valve_type", "service", "valve_standard",
  "pressure_class", "design_pressure", "design_temperature",
  "corrosion_allowance", "sour_service",
  "end_connections", "face_to_face",
];

const STANDALONE_KEYS = [
  "marking_purchaser", "marking_manufacturer", "inspection_testing", "leakage_rate",
  "hydrotest_shell", "hydrotest_closure", "pneumatic_test", "material_certification",
  "fire_rating", "finish",
];

/** Fields that must always appear on the datasheet even when the value is "-". */
const ALWAYS_SHOW_FIELDS = new Set(["sour_service"]);

// ── "Others" suppression ────────────────────────────────────────────────────
//
// Mirrors backend `app/engine/card_filter.py::card_field_keys()` — the set of
// fields configured under non-"Others" sections in `app/data/field_mappings.yaml`.
// Any field NOT in this allowlist would otherwise leak into a generic "Others"
// section of the downloaded sheet. We strip them here (option ii: hardcoded
// frontend allowlist) because there is no existing backend endpoint that
// returns pre-filtered card data for the download path — `/datasheets/batch`
// and the agent stream both deliver raw rule-engine output.
//
// Keep this list in sync with field_mappings.yaml when sections are edited.
const ALLOWED_FIELD_KEYS = new Set<string>([
  // Header (vds_no is rendered in the header row only, not in body — see filterOthers)
  "piping_class", "size_range", "valve_type", "service",
  // Design
  "valve_standard", "pressure_class", "design_pressure", "corrosion_allowance",
  "sour_service",
  "max_design_temp", "soft_seat_temp_limit",
  // Configuration
  "end_connections", "face_to_face", "operation",
  // Construction
  "body_construction", "stem_construction", "ball_construction",
  "disc_construction", "wedge_construction", "shaft_construction",
  "seat_construction", "back_seat_construction", "packing_construction",
  "bonnet_construction", "locks",
  // Material
  "body_material", "ball_material", "disc_material", "wedge_material",
  "needle_material", "stem_material", "trim_material", "seat_material",
  "seal_material", "shaft_material", "gland_material", "gland_packing",
  "spring_material", "backseat", "back_seat_material", "lever_handwheel",
  "hinge_pin_material", "bonnet_material", "flange_moc", "flange_standard",
  "flange_facing", "flange_facing_finish", "rtj_groove_hardness",
  "gasket_contact_roughness", "gaskets", "bolts", "nuts",
  // Testing
  "marking_purchaser", "marking_manufacturer", "inspection_testing",
  "leakage_rate", "hydrotest_shell", "hydrotest_closure", "pneumatic_test",
  "material_certification", "fire_rating", "finish", "applicable_notes",
  // Additional rendered keys not in field_mappings but used by the builder
  // (notes block, design_temperature merged with design_pressure, etc.)
  "design_temperature", "datasheet_notes", "notes", "remarks",
  "flange_material", "construction_bonnet",
  "material_needle_material", "material_cover_material",
  "material_hinge/_hinge_pin",
]);

/** Strip fields that would land in the "Others" section of the card UI. */
function filterOthers(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    const lower = k.toLowerCase();
    // Preserve note-like keys regardless (the builder renders them separately).
    if (
      ALLOWED_FIELD_KEYS.has(k) ||
      lower === "notes" ||
      lower === "remarks" ||
      lower.endsWith("_note") ||
      lower.endsWith("_notes")
    ) {
      out[k] = v;
    }
  }
  return out;
}

const THIN_BORDERS: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEEEEEE" },
};

const SECTION_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEEEEEE" },
};

const BRAND_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E3A5F" },
};

const ERROR_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFDE8E8" },  // Light red background
};

const ERROR_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFDC2626" },  // Bold red header
};

const WARNING_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFBEB" },  // Light amber background
};

const WARNING_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD97706" },  // Bold amber header
};

const ERROR_FONT: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 11,
  color: { argb: "FFDC2626" },
};

const WARNING_FONT: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 11,
  color: { argb: "FF92400E" },
};

function readValue(data: Record<string, string>, key: string): string {
  const raw = data[key];
  if (raw === null || raw === undefined) return "-";
  const value = String(raw).trim();
  return value.length > 0 ? value : "-";
}

function fieldLabel(key: string): string {
  return FIELD_NAMES[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getValveTypeTitle(rawType: string): string {
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

function valveTypeHiddenKeys(data: Record<string, string>): Set<string> {
  const vtRaw = readValue(data, "valve_type");
  const valveType = vtRaw === "-" ? "" : vtRaw.toLowerCase();
  const shaft = readValue(data, "shaft_material");
  const stem = readValue(data, "stem_material");
  const hidden = new Set<string>();
  const isButterflyLayout =
    valveType.includes("butterfly") ||
    (shaft !== "-" && stem === "-");
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

function estimateRowHeight(text: string, charsPerLine: number, minHeight = 30): number {
  const safe = (text || "").trim();
  if (!safe) return minHeight;
  const lineBreaks = (safe.match(/\n/g) || []).length;
  const wrappedLines = Math.ceil(safe.length / charsPerLine);
  const totalLines = Math.max(1, wrappedLines + lineBreaks);
  return Math.min(360, Math.max(minHeight, totalLines * 15));
}

// ── Core worksheet builder ──────────────────────────────────────────────────

export interface DatasheetInput {
  vdsCode: string;
  data: Record<string, string>;
  validationErrors?: string[];
  validationWarnings?: string[];
  projectName?: string;
  docNumber?: string;
  revisionNumber?: string;
}

export async function buildDatasheetWorksheet(
  ws: ExcelJS.Worksheet,
  input: DatasheetInput,
): Promise<void> {
  const { vdsCode } = input;
  const data = filterOthers(input.data);
  const hiddenKeys = valveTypeHiddenKeys(data);

  const projectName = input.projectName || "FPSO P-82 Albacora Leste";
  const revisionNumber = input.revisionNumber || "";

  ws.views = [{ showGridLines: false }];
  // Exact column widths from reference file
  ws.columns = [
    { width: 16 },  // A — section label
    { width: 22 },  // B — sub-label
    { width: 85 },  // C — value
    { width: 22 },  // D — vendor offer
    { width: 22 },  // E — vendor offer (merged with D)
  ];

  ws.pageSetup = {
    paperSize: 9,
    orientation: "portrait" as const,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  ws.getRow(1).height = 38;
  ws.getRow(2).height = 38;
  ws.getRow(3).height = 38;

  // Paint every cell in A1:E3 gray before merging — most reliable way in ExcelJS
  for (let r = 1; r <= 3; r++) {
    for (let c = 1; c <= 5; c++) {
      ws.getCell(r, c).fill = HEADER_FILL;
    }
  }

  // A1:B3 — logo area
  ws.mergeCells("A1:B3");
  ws.getCell("A1").border = THIN_BORDERS;
  ws.getCell("A1").fill = HEADER_FILL;

  // Logo insertion — preserve aspect ratio and center within A1:B3
  try {
    let logoRes = await fetch("/excel-logo.png");
    if (!logoRes.ok) logoRes = await fetch("/favicon.png");
    if (logoRes.ok) {
      const logoArrayBuffer = await logoRes.arrayBuffer();

      // Measure natural dimensions so we never stretch the image
      let naturalW = 200, naturalH = 60;
      try {
        const blob = new Blob([logoArrayBuffer]);
        const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
          const img = new Image();
          const url = URL.createObjectURL(blob);
          img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
          img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load")); };
          img.src = url;
        });
        naturalW = dims.w;
        naturalH = dims.h;
      } catch { /* keep defaults */ }

      // Scale to fit within logo area (max 230 × 90 px), preserving aspect ratio
      const maxW = 230, maxH = 90;
      const scale = Math.min(maxW / naturalW, maxH / naturalH, 1);
      const logoW = Math.round(naturalW * scale);
      const logoH = Math.round(naturalH * scale);

      // Center within the A1:B3 merged area
      // A=16 chars≈112px, B=22 chars≈154px → total≈266px wide; 3 rows×38pt≈152px tall
      const areaW = 266, areaH = 152;
      const padLeft = Math.max(0, (areaW - logoW) / 2);
      const padTop  = Math.max(0, (areaH - logoH) / 2);
      // Convert px offsets to fractional col/row indices (col A ≈ 112px, each row ≈ 50.7px)
      const tlCol = padLeft / 112;
      const tlRow = padTop  / 50.7;

      const bytes = new Uint8Array(logoArrayBuffer);
      let binary = "";
      bytes.forEach((b) => { binary += String.fromCharCode(b); });
      const base64 = btoa(binary);

      const logoId = ws.workbook.addImage({
        base64: `data:image/png;base64,${base64}`,
        extension: "png",
      });
      ws.addImage(logoId, {
        tl: { col: tlCol, row: tlRow },
        ext: { width: logoW, height: logoH },
        editAs: "oneCell",
      });
    }
  } catch {
    // Logo load failure is non-critical
  }

  ws.mergeCells("C1:C3");
  const valveTypeTitle = getValveTypeTitle(readValue(data, "valve_type"));
  const titleCell = ws.getCell("C1");
  titleCell.value = `${valveTypeTitle} DATASHEET`;
  titleCell.font = { name: "Calibri", size: 18, bold: true };
  titleCell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
  titleCell.fill = HEADER_FILL;
  titleCell.border = THIN_BORDERS;

  ws.mergeCells("D1:E2");
  const projCell = ws.getCell("D1");
  projCell.value = `Project: ${projectName}`;
  projCell.font = { name: "Calibri", size: 10, bold: true };
  projCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  projCell.fill = HEADER_FILL;
  projCell.border = THIN_BORDERS;

  const pageNoCell = ws.getCell("D3");
  pageNoCell.value = "Page No.";
  pageNoCell.font = { name: "Calibri", size: 10, bold: true };
  pageNoCell.alignment = { horizontal: "left", vertical: "middle" };
  pageNoCell.fill = HEADER_FILL;
  pageNoCell.border = THIN_BORDERS;

  const pageNumCell = ws.getCell("E3");
  pageNumCell.value = "1 of 1";
  pageNumCell.font = { name: "Calibri", size: 10 };
  pageNumCell.alignment = { horizontal: "center", vertical: "middle" };
  pageNumCell.fill = HEADER_FILL;
  pageNumCell.border = THIN_BORDERS;

  // ── Row 4 — VDS row (height 24) ──
  ws.getRow(4).height = 24;

  ws.mergeCells("A4:B4");
  const vdsLabelCell = ws.getCell("A4");
  vdsLabelCell.value = "VDS No";
  vdsLabelCell.font = { name: "Calibri", size: 11, bold: true };
  vdsLabelCell.alignment = { horizontal: "center", vertical: "middle" };
  vdsLabelCell.fill = HEADER_FILL;
  vdsLabelCell.border = THIN_BORDERS;

  const vdsValueCell = ws.getCell("C4");
  vdsValueCell.value = vdsCode;
  vdsValueCell.font = { name: "Calibri", size: 11, bold: true };
  vdsValueCell.alignment = { horizontal: "center", vertical: "middle" };
  vdsValueCell.fill = HEADER_FILL;
  vdsValueCell.border = THIN_BORDERS;

  ws.mergeCells("D4:E4");
  const vendorHeaderCell = ws.getCell("D4");
  vendorHeaderCell.value = "Vendor Offer";
  vendorHeaderCell.font = { name: "Calibri", size: 11, bold: true };
  vendorHeaderCell.alignment = { horizontal: "center", vertical: "middle" };
  vendorHeaderCell.fill = HEADER_FILL;
  vendorHeaderCell.border = THIN_BORDERS;

  // ── Row 5 — Document Number + Revision (height 24) ──
  const docNo = input.docNumber || "";
  const revNo = revisionNumber || "";
  ws.getRow(5).height = 24;

  ws.mergeCells("A5:B5");
  const docLabelCell = ws.getCell("A5");
  docLabelCell.value = "Doc No.";
  docLabelCell.font = { name: "Calibri", size: 11, bold: true };
  docLabelCell.alignment = { horizontal: "center", vertical: "middle" };
  docLabelCell.fill = HEADER_FILL;
  docLabelCell.border = THIN_BORDERS;

  const docValueCell = ws.getCell("C5");
  docValueCell.value = docNo;
  docValueCell.font = { name: "Calibri", size: 11, bold: true };
  docValueCell.alignment = { horizontal: "center", vertical: "middle" };
  docValueCell.fill = HEADER_FILL;
  docValueCell.border = THIN_BORDERS;

  const revLabelCell = ws.getCell("D5");
  revLabelCell.value = "Rev.";
  revLabelCell.font = { name: "Calibri", size: 11, bold: true };
  revLabelCell.alignment = { horizontal: "center", vertical: "middle" };
  revLabelCell.fill = HEADER_FILL;
  revLabelCell.border = THIN_BORDERS;

  const revValueCell = ws.getCell("E5");
  revValueCell.value = revNo;
  revValueCell.font = { name: "Calibri", size: 11 };
  revValueCell.alignment = { horizontal: "center", vertical: "middle" };
  revValueCell.fill = HEADER_FILL;
  revValueCell.border = THIN_BORDERS;

  // ── Row helpers ──

  // Simple row: A:B merged label (bold), C value, D:E merged blank
  const writeSimple = (rowNum: number, label: string, value: string) => {
    ws.getRow(rowNum).height = Math.max(26, estimateRowHeight(value, 70, 26));
    ws.mergeCells(`A${rowNum}:B${rowNum}`);
    const lc = ws.getCell(`A${rowNum}`);
    lc.value = label;
    lc.font = { name: "Calibri", size: 10, bold: true };
    lc.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    lc.border = THIN_BORDERS;
    const vc = ws.getCell(`C${rowNum}`);
    vc.value = value;
    vc.font = { name: "Calibri", size: 10 };
    vc.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    vc.border = THIN_BORDERS;
    ws.mergeCells(`D${rowNum}:E${rowNum}`);
    const dc = ws.getCell(`D${rowNum}`);
    dc.value = "";
    dc.border = THIN_BORDERS;
  };

  // Sub-row inside grouped section: A gets border only (section merges A vertically),
  // B sub-label, C value, D:E merged blank
  const writeSubRow = (rowNum: number, subLabel: string, value: string) => {
    ws.getRow(rowNum).height = Math.max(26, estimateRowHeight(value, 70, 26));
    const ac = ws.getCell(`A${rowNum}`);
    ac.border = THIN_BORDERS;
    const bc = ws.getCell(`B${rowNum}`);
    bc.value = subLabel;
    bc.font = { name: "Calibri", size: 10 };
    bc.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    bc.border = THIN_BORDERS;
    const cc = ws.getCell(`C${rowNum}`);
    cc.value = value;
    cc.font = { name: "Calibri", size: 10 };
    cc.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    cc.border = THIN_BORDERS;
    ws.mergeCells(`D${rowNum}:E${rowNum}`);
    const dc = ws.getCell(`D${rowNum}`);
    dc.value = "";
    dc.border = THIN_BORDERS;
  };

  // ── Validation section ──
  const { validationErrors, validationWarnings } = input;
  const hasValErrors = (validationErrors?.length ?? 0) > 0;
  const hasValWarnings = (validationWarnings?.length ?? 0) > 0;

  let row = 6;

  if (hasValErrors) {
    ws.mergeCells(`A${row}:E${row}`);
    const reviewCell = ws.getCell(`A${row}`);
    reviewCell.value = "DRAFT — Please review with your engineering team before use";
    reviewCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFDC2626" } };
    reviewCell.fill = ERROR_FILL;
    reviewCell.alignment = { horizontal: "center", vertical: "middle" };
    reviewCell.border = THIN_BORDERS;
    ws.getRow(row).height = 26;
    row++;

    ws.mergeCells(`A${row}:E${row}`);
    const errHeader = ws.getCell(`A${row}`);
    errHeader.value = "VALIDATION ERRORS";
    errHeader.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    errHeader.fill = ERROR_HEADER_FILL;
    errHeader.alignment = { horizontal: "center", vertical: "middle" };
    errHeader.border = THIN_BORDERS;
    ws.getRow(row).height = 28;
    row++;

    validationErrors!.forEach((err, i) => {
      ws.mergeCells(`A${row}:E${row}`);
      const cell = ws.getCell(`A${row}`);
      cell.value = `${i + 1}. ${err}`;
      cell.font = ERROR_FONT;
      cell.fill = ERROR_FILL;
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = THIN_BORDERS;
      ws.getRow(row).height = estimateRowHeight(err, 140);
      row++;
    });
    row++;
  }

  if (hasValWarnings) {
    if (!hasValErrors) {
      ws.mergeCells(`A${row}:E${row}`);
      const reviewCell = ws.getCell(`A${row}`);
      reviewCell.value = "Please review warnings with your engineering team before approval";
      reviewCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF92400E" } };
      reviewCell.fill = WARNING_FILL;
      reviewCell.alignment = { horizontal: "center", vertical: "middle" };
      reviewCell.border = THIN_BORDERS;
      ws.getRow(row).height = 26;
      row++;
    }

    ws.mergeCells(`A${row}:E${row}`);
    const warnHeader = ws.getCell(`A${row}`);
    warnHeader.value = "VALIDATION WARNINGS";
    warnHeader.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    warnHeader.fill = WARNING_HEADER_FILL;
    warnHeader.alignment = { horizontal: "center", vertical: "middle" };
    warnHeader.border = THIN_BORDERS;
    ws.getRow(row).height = 28;
    row++;

    validationWarnings!.forEach((warn, i) => {
      ws.mergeCells(`A${row}:E${row}`);
      const cell = ws.getCell(`A${row}`);
      cell.value = `${i + 1}. ${warn}`;
      cell.font = WARNING_FONT;
      cell.fill = WARNING_FILL;
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = THIN_BORDERS;
      ws.getRow(row).height = estimateRowHeight(warn, 140);
      row++;
    });
    row++;
  }

  // ── Data sections ──
  const writtenKeys = new Set<string>();

  // Basic fields — merge design_pressure + design_temperature when both present
  const dpRaw = readValue(data, "design_pressure");
  const dtRaw = readValue(data, "design_temperature");
  const mergeDuty = dpRaw !== "-" && dtRaw !== "-";

  BASIC_FIELDS.forEach((key) => {
    if (mergeDuty && key === "design_temperature") {
      writtenKeys.add(key);
      return;
    }
    const value = readValue(data, key);
    if (value === "-" && !ALWAYS_SHOW_FIELDS.has(key)) return;
    const displayValue =
      mergeDuty && key === "design_pressure"
        ? `${dpRaw} @ ${dtRaw}`
        : value === "-" ? "Not Applicable" : value;
    writeSimple(row, fieldLabel(key), displayValue);
    writtenKeys.add(key);
    row++;
  });

  // Grouped section: A column spans all sub-rows vertically
  const writeSection = (sectionTitle: string, keys: string[]) => {
    const visibleKeys = keys.filter((k) => !hiddenKeys.has(k) && readValue(data, k) !== "-");
    if (visibleKeys.length === 0) return;

    const startRow = row;
    visibleKeys.forEach((key) => {
      writeSubRow(row, fieldLabel(key), readValue(data, key));
      writtenKeys.add(key);
      row++;
    });

    if (visibleKeys.length > 1) {
      ws.mergeCells(`A${startRow}:A${row - 1}`);
    }
    const secCell = ws.getCell(`A${startRow}`);
    secCell.value = sectionTitle;
    secCell.font = { name: "Calibri", size: 10, bold: true };
    secCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    secCell.fill = SECTION_FILL;
    secCell.border = THIN_BORDERS;
  };

  const constructionKeys = constructionOrderFor(readValue(data, "valve_type"));
  writeSection("Construction", constructionKeys);

  if (readValue(data, "operation") !== "-") {
    writeSimple(row, "Operation", readValue(data, "operation"));
    writtenKeys.add("operation");
    row++;
  }

  const materialKeys = materialOrderFor(readValue(data, "valve_type"));
  writeSection("Material", materialKeys);

  STANDALONE_KEYS.forEach((key) => {
    if (hiddenKeys.has(key) || writtenKeys.has(key) || readValue(data, key) === "-") return;
    writeSimple(row, fieldLabel(key), readValue(data, key));
    writtenKeys.add(key);
    row++;
  });

  // ── Notes section ──
  const notesRaw = readValue(data, "notes");
  const datasheetNotes = readValue(data, "datasheet_notes");
  const notesText = notesRaw !== "-" ? notesRaw : datasheetNotes !== "-" ? datasheetNotes : null;

  if (notesText) {
    ws.mergeCells(`A${row}:E${row}`);
    const notesHeaderCell = ws.getCell(`A${row}`);
    notesHeaderCell.value = "Notes";
    notesHeaderCell.font = { name: "Calibri", size: 10, bold: true };
    notesHeaderCell.alignment = { horizontal: "left", vertical: "middle" };
    notesHeaderCell.fill = SECTION_FILL;
    notesHeaderCell.border = THIN_BORDERS;
    ws.getRow(row).height = 20;
    row++;

    const noteLines = notesText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    noteLines.forEach((line) => {
      ws.mergeCells(`A${row}:E${row}`);
      const noteCell = ws.getCell(`A${row}`);
      noteCell.value = line;
      noteCell.font = { name: "Calibri", size: 10 };
      noteCell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      noteCell.border = THIN_BORDERS;
      ws.getRow(row).height = Math.max(20, estimateRowHeight(line, 160, 20));
      row++;
    });
  }
  // No signatures, no footer
}

// ── Single workbook (multiple sheets) ───────────────────────────────────────

/**
 * Build a single XLSX workbook with one sheet per datasheet.
 * Used when ≤5 datasheets are selected.
 */
export async function buildMultiSheetWorkbook(
  inputs: DatasheetInput[],
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Valve AI Agent";
  wb.created = new Date();

  for (const input of inputs) {
    const ws = wb.addWorksheet(input.vdsCode);
    await buildDatasheetWorksheet(ws, input);
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ── ZIP archive (individual XLSX files) ─────────────────────────────────────

/**
 * Build a ZIP archive with one XLSX file per datasheet.
 * Used when >5 datasheets are selected.
 */
export async function buildZipArchive(
  inputs: DatasheetInput[],
): Promise<Blob> {
  const zip = new JSZip();

  for (const input of inputs) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Valve AI Agent";
    wb.created = new Date();
    const ws = wb.addWorksheet(input.vdsCode);
    await buildDatasheetWorksheet(ws, input);
    const buf = await wb.xlsx.writeBuffer();
    zip.file(`${input.vdsCode}_datasheet.xlsx`, buf);
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

// ── Single datasheet download ───────────────────────────────────────────────

/**
 * Build and download a single professional XLSX datasheet.
 * Tracks download in backend for library.
 */
export async function downloadSingleDatasheet(
  input: DatasheetInput,
  sessionId?: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Valve AI Agent";
  wb.created = new Date();
  const ws = wb.addWorksheet(input.vdsCode);
  await buildDatasheetWorksheet(ws, input);

  const filename = `${input.vdsCode}_datasheet.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, filename);

  // Track in backend (fire-and-forget)
  saveDownload({
    session_id: sessionId,
    vds_codes: [input.vdsCode],
    filename,
    download_type: "xlsx",
    sheet_count: 1,
  });
}

// ── Smart bulk download (auto-selects single vs ZIP) ────────────────────────

/**
 * Download datasheets — single workbook for ≤5, ZIP for >5.
 * Tracks download in backend for library.
 */
export async function downloadBulkDatasheets(
  inputs: DatasheetInput[],
  sessionId?: string,
): Promise<void> {
  if (inputs.length === 0) return;

  if (inputs.length === 1) {
    await downloadSingleDatasheet(inputs[0], sessionId);
    return;
  }

  const vdsCodes = inputs.map((i) => i.vdsCode);

  if (inputs.length <= 5) {
    // Single XLSX workbook with multiple sheets
    const blob = await buildMultiSheetWorkbook(inputs);
    const codes = vdsCodes.join("_");
    const filename = `VDS_${codes}.xlsx`;
    triggerDownload(blob, filename);

    saveDownload({
      session_id: sessionId,
      vds_codes: vdsCodes,
      filename,
      download_type: "xlsx",
      sheet_count: inputs.length,
    });
  } else {
    // ZIP archive with individual files
    const blob = await buildZipArchive(inputs);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `VDS_Batch_${date}_${inputs.length}sheets.zip`;
    triggerDownload(blob, filename);

    saveDownload({
      session_id: sessionId,
      vds_codes: vdsCodes,
      filename,
      download_type: "zip",
      sheet_count: inputs.length,
    });
  }
}

// ── Trigger browser download ────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
