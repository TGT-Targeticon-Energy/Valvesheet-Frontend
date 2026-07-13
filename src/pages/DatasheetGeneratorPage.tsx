import { useState, useEffect, useCallback, useMemo } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileSpreadsheet,
  Save,
  Download,
  Printer,
  Zap,
  CheckCircle2,
  Settings2,
  Wrench,
  TestTube,
  FileCheck,
  Clipboard,
  Lock,
  Info,
  Loader2,
  AlertCircle,
  Search,
  FolderKanban,
  ChevronsUpDown, // Added for combobox
  Check,
  RefreshCcw, // Added for combobox
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { canGenerateDatasheet, getRoleCode } from "@/lib/roles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import api, { type DatasheetResponse, type FlatDatasheetResponse, type VDSListResponse, type ValveTypeTemplatesResponse, type MLFlatPredictionResponse, type VDSSuggestionItem, type VDSRevisionLogEntry, type ValvesheetRecord } from "@/services/api";
import { authService } from "@/services/authService";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import html2pdf from 'html2pdf.js';
import ExcelJS from "exceljs";

const USER_MGMT_API_URL = import.meta.env.VITE_USER_MGMT_API;

interface ProjectInfo {
  project_id: string;
  project_name: string;
  sap_project_code: string;
}

const valveTypes = [
  { value: "ball", label: "Ball Valve", prefix: "BL" },
  { value: "gate", label: "Gate Valve", prefix: "GA" },
  { value: "globe", label: "Globe Valve", prefix: "GL" },
  { value: "check", label: "Check Valve", prefix: "CH" },
  { value: "dbb", label: "Double Block & Bleed (DBB)", prefix: "DB" },
  { value: "needle", label: "Needle Valve", prefix: "NE" },
  { value: "butterfly", label: "Butterfly Valve", prefix: "BF" },
];

const pipingClasses = [
  { value: "A1", label: "A1 - Carbon Steel" },
  { value: "A2", label: "A2 - Low Alloy Steel" },
  { value: "B1", label: "B1 - Stainless Steel 316" },
  { value: "B2", label: "B2 - Stainless Steel 304" },
  { value: "C1", label: "C1 - Duplex Steel" },
];

const pressureClasses = [
  { value: "ASME B16.34 Class 150", label: "ASME B16.34 Class 150" },
  { value: "ASME B16.34 Class 300", label: "ASME B16.34 Class 300" },
  { value: "ASME B16.34 Class 600", label: "ASME B16.34 Class 600" },
  { value: "ASME B16.34 Class 900", label: "ASME B16.34 Class 900" },
  { value: "ASME B16.34 Class 1500", label: "ASME B16.34 Class 1500" },
  { value: "ASME B16.34 Class 2500", label: "ASME B16.34 Class 2500" },
  { value: "150", label: "Class 150" },
  { value: "300", label: "Class 300" },
  { value: "600", label: "Class 600" },
  { value: "900", label: "Class 900" },
  { value: "1500", label: "Class 1500" },
  { value: "2500", label: "Class 2500" },
];

const valveStandards = [
  { value: "API 6D", label: "API 6D" },
  { value: "API 6D / ISO 17292", label: "API 6D / ISO 17292" },
  { value: "ISO 17292", label: "ISO 17292" },
  { value: "ASME B16.34", label: "ASME B16.34" },
  { value: "BS 5351", label: "BS 5351" },
  { value: "API 600", label: "API 600" },
  { value: "API 600, 602 or API 603", label: "API 600, 602 or API 603" },
  { value: "API 594", label: "API 594" },
  { value: "API 594, API 6D", label: "API 594, API 6D" },
  { value: "API 602", label: "API 602" },
  { value: "API 609", label: "API 609" },
  { value: "API 599", label: "API 599" },
];

const endConnections = [
  { value: "Flanged ASME B16.5 RF", label: "Flanged ASME B16.5 RF" },
  { value: "Flanged ASME B16.5 RTJ", label: "Flanged ASME B16.5 RTJ" },
  { value: "Flanged ASME B16.5 FF", label: "Flanged ASME B16.5 FF" },
  { value: "Butt Weld", label: "Butt Weld" },
  { value: "Socket Weld", label: "Socket Weld" },
  { value: "Threaded NPT", label: "Threaded NPT" },
  { value: "Hub Connector per API 6A", label: "Hub Connector" },
  { value: "NPT Female Threaded per ASME B1.20.1", label: "NPT Female" },
];

const operationModes = [
  { value: "Lever Operated", label: "Lever Operated" },
  { value: "Gear Operated", label: "Gear Operated" },
  { value: "Pneumatic Actuated", label: "Pneumatic Actuated" },
  { value: "Electric Actuated", label: "Electric Actuated" },
  { value: "Hydraulic Actuated", label: "Hydraulic Actuated" },
];

const steps = [
  { id: 1, title: "Basic Info", icon: Settings2, description: "Valve identification & design parameters" },
  { id: 2, title: "Construction", icon: Wrench, description: "Body, ball & operation details" },
  { id: 3, title: "Materials", icon: Clipboard, description: "Component materials specification" },
  { id: 4, title: "Compliance", icon: FileCheck, description: "Code & certification requirements" },
  { id: 5, title: "Testing", icon: TestTube, description: "Test pressures & requirements" },
  { id: 6, title: "Notes", icon: Clipboard, description: "General notes & remarks" },
];
const NOTES_MAX_LENGTH = 750;

const fieldDisplayNames: Record<string, string> = {
  vds_no: "VDS Number",
  piping_class: "Piping Class",
  size_range: "Size Range",
  valve_type: "Valve Type",
  service: "Service",
  valve_standard: "Valve Standard",
  pressure_class: "Pressure Class",
  design_pressure: "Design Pressure",
  corrosion_allowance: "Corrosion Allowance",
  sour_service: "Sour Service",
  end_connections: "End Connection",
  face_to_face: "Face to Face",
  // Construction (no "Construction" suffix)
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
  // Materials (no "Material" suffix)
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
  inspection_testing: "Inspection & Testing",
  material_certification: "Material Certification",
  fire_rating: "Fire Rating",
  marking_purchaser: "Marking (Purchaser) Specification",
  marking_manufacturer: "Marking (Manufacturer)",
  finish: "Finish",
};

const fieldCategories: Record<string, string[]> = {
  basic: [
    "vds_no", "piping_class", "size_range", "valve_type", "service",
    "valve_standard", "pressure_class", "design_pressure", "corrosion_allowance",
    "sour_service", "end_connections", "face_to_face"
  ],
  construction: [
    "body_construction", "ball_construction", "stem_construction", "seat_construction",
    "disc_construction", "wedge_construction", "shaft_construction", "back_seat_construction",
    "packing_construction", "bonnet_construction", "construction_bonnet", "locks", "operation"
  ],
  materials: [
    "body_material", "ball_material", "stem_material", "seat_material", "seal_material",
    "gland_material", "gland_packing", "lever_handwheel", "spring_material", "gaskets",
    "bolts", "nuts", "disc_material", "wedge_material", "trim_material", "shaft_material",
    "needle_material", "material_needle_material", "back_seat_material", "hinge_pin_material",
    "material_cover_material", "material_hinge/_hinge_pin"
  ],
  testing: [
    "hydrotest_shell", "hydrotest_closure", "pneumatic_test", "leakage_rate", "inspection_testing", "fire_rating", "finish"
  ],
  compliance: [
    "material_certification", "marking_purchaser", "marking_manufacturer"
  ],
};

// Legacy mapping (kept for PDF/CSV export compatibility)
const fieldKeyToFormKey: Record<string, string> = {
  body_construction: "bodyConstruction",
  ball_construction: "ballType",
  stem_construction: "stemType",
  seat_construction: "seatType",
  disc_construction: "discConstruction",
  wedge_construction: "wedgeConstruction",
  shaft_construction: "shaftConstruction",
  back_seat_construction: "backSeatConstruction",
  packing_construction: "packingConstruction",
  bonnet_construction: "bonnetConstruction",
  locks: "locks",
  body_material: "bodyMaterial",
  ball_material: "ballMaterial",
  stem_material: "stemMaterial",
  seat_material: "seatMaterial",
  seal_material: "sealMaterial",
  gland_material: "glandMaterial",
  gland_packing: "glandPacking",
  lever_handwheel: "leverMaterial",
  spring_material: "springMaterial",
  gaskets: "gasketMaterial",
  bolts: "boltMaterial",
  nuts: "nutMaterial",
  disc_material: "discMaterial",
  wedge_material: "wedgeMaterial",
  trim_material: "trimMaterial",
  shaft_material: "shaftMaterial",
  needle_material: "needleMaterial",
  hingePinMaterial: "hingePinMaterial",
};

function isLikelyCompleteVDS(vdsCode: string): boolean {
  const code = (vdsCode || "").toUpperCase().trim();
  return /^(BL|BS|BF|GA|GL|CH|DB|NE)[A-Z][MPT][A-Z0-9]{2,}(JT|R|J|F)$/.test(code);
}

const resolveTemplateKey = (valveTypeValue: string): string => {
  const typeMap: Record<string, string> = {
    ball: "BALL",
    gate: "GATE",
    globe: "GLOBE",
    check: "CHECK",
    butterfly: "BUTTERFLY",
    dbb: "DBB",
    needle: "NEET",
  };
  return typeMap[valveTypeValue] || "BALL";
};

const defaultFormData = {
  vdsNumber: "",
  pipingClass: "",
  sizeRange: "",
  valveType: "",
  boreType: "",
  service: "",
  valveStandard: "",
  pressureClass: "",
  designPressure: "",
  corrosionAllowance: "",
  sourService: "",
  endConnection: "",
  faceToFace: "",
  bodyConstruction: "",
  ballType: "",
  stemType: "",
  seatType: "",
  discConstruction: "",
  wedgeConstruction: "",
  shaftConstruction: "",
  backSeatConstruction: "",
  packingConstruction: "",
  bonnetConstruction: "",
  locks: "",
  lockable: true,
  operationMode: "",
  bodyMaterial: "",
  ballMaterial: "",
  seatMaterial: "",
  sealMaterial: "",
  stemMaterial: "",
  glandMaterial: "",
  glandPacking: "",
  leverMaterial: "",
  springMaterial: "",
  gasketMaterial: "",
  boltMaterial: "",
  nutMaterial: "",
  discMaterial: "",
  wedgeMaterial: "",
  trimMaterial: "",
  shaftMaterial: "",
  needleMaterial: "",
  hingePinMaterial: "",
  shellTestPressure: "",
  closureTestPressure: "",
  pneumaticTestPressure: "",
  leakageRate: "",
  materialCertification: "",
  fireRating: "",
  inspectionStandard: "",
  sourServiceReq: "none",
  notes: "",
};

const awardVersionOptions = [
  { value: "pre_contract", label: "Pre Contract" },
  { value: "post_contract", label: "Post Contract" },
];

const purposeOfIssueOptionsByVersion: Record<string, { value: string; label: string }[]> = {
  pre_contract: [
    { value: "inter_discipline_check", label: "Inter-discipline check(IDC)/ Squad Check" },
    { value: "comment_review_approval_rfq", label: "Issued for Comment / Review / Approval / RFQ" },
    { value: "proposal_tender_aff", label: "Issued for Proposal / Tender / Approved for FEED (AFF)" },
    { value: "pre_award_information", label: "Issued for Information" },
    { value: "void_or_cancelled", label: "Void or Cancelled" },
  ],
  post_contract: [
    { value: "comment_review_approval_info", label: "Issued for Comment / Review / Approval / Information" },
    { value: "afc_purchase_pos", label: "Approved for Construction (AFC) / Purchase / Use Approved for Purchase Specification (POS)" },
    { value: "as_built_iff", label: "As Built / Issued for Final (IFF)" },
    { value: "post_award_information", label: "Issued for Information" },
    { value: "void_or_cancelled", label: "Void or Cancelled" },
  ],
};

const optionShortCodeByPurpose: Record<string, string> = {
  inter_discipline_check: "IDC",
  comment_review_approval_rfq: "CRA",
  proposal_tender_aff: "PTA",
  pre_award_information: "PAI",
  comment_review_approval_info: "CAI",
  comment_review_approval_information: "CAI", // legacy alias
  afc_purchase_pos: "AFC",
  as_built_iff: "ABI",
  post_award_information: "POI",
  void_or_cancelled: "VOI",
};

const reviewStepPurposes = new Set<string>([
  "inter_discipline_check",
  "comment_review_approval_rfq",
]);

const REVISION_CHANGE_PREFIX = "[REVISION_CODE]";

type RevisionRule =
  | { type: "series"; prefix: string; start: number; pad?: number }
  | { type: "idc_transition" }
  | { type: "fixed"; value: string };

const revisionRuleByPurpose: Record<string, RevisionRule> = {
  inter_discipline_check: { type: "idc_transition" }, // A0, then R0/R1/...
  comment_review_approval_rfq: { type: "series", prefix: "A", start: 1 }, // A1, A2, ...
  proposal_tender_aff: { type: "series", prefix: "C", start: 0 }, // C0, C1, ...
  pre_award_information: { type: "series", prefix: "P", start: 1 }, // P1, P2, ...
  void_or_cancelled: { type: "fixed", value: "XX" },
  comment_review_approval_info: { type: "series", prefix: "C", start: 1 }, // C1, C2, ...
  comment_review_approval_information: { type: "series", prefix: "C", start: 1 }, // legacy alias
  afd_enquiry: { type: "series", prefix: "D", start: 0 }, // legacy support
  afc_purchase_pos: { type: "series", prefix: "", start: 0, pad: 2 }, // 00, 01, 02, ...
  as_built_iff: { type: "series", prefix: "Z", start: 1 }, // Z1, Z2, ...
  post_award_information: { type: "series", prefix: "P", start: 1 }, // P1, P2, ...
};

type RevisionMeta = {
  purpose: string;
  code: string;
  version?: string;
  project_id?: string;
  project_code?: string;
  project_name?: string;
  tracking_code?: string;
  option_short?: string;
  phase?: string;
  action?: string;
  status?: string;
};

const parseRevisionChange = (changes: string): RevisionMeta | null => {
  if (!changes) return null;
  const normalized = changes.replace(/\[REVISION_CODE\]\s*/i, "");
  const pairs = normalized
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq === -1) return null;
      const key = part.slice(0, eq).trim().toLowerCase();
      const value = part.slice(eq + 1).trim();
      return key && value ? { key, value } : null;
    })
    .filter((item): item is { key: string; value: string } => Boolean(item));

  const purpose = pairs.find((p) => p.key === "purpose")?.value;
  const code = pairs.find((p) => p.key === "code")?.value;
  const version = pairs.find((p) => p.key === "version")?.value;
  const projectId = pairs.find((p) => p.key === "project_id")?.value;
  const projectCode = pairs.find((p) => p.key === "project_code")?.value;
  const projectName = pairs.find((p) => p.key === "project_name")?.value;
  const trackingCode = pairs.find((p) => p.key === "tracking_code")?.value;
  const optionShort = pairs.find((p) => p.key === "option_short")?.value;
  const phase = pairs.find((p) => p.key === "phase")?.value;
  const action = pairs.find((p) => p.key === "action")?.value;
  const status = pairs.find((p) => p.key === "status")?.value;

  if (!purpose || !code) return null;
  return {
    purpose,
    code,
    version,
    project_id: projectId,
    project_code: projectCode,
    project_name: projectName,
    tracking_code: trackingCode,
    option_short: optionShort,
    phase,
    action,
    status,
  };
};

const buildRevisionChangeNote = (
  purpose: string,
  code: string,
  version?: string,
  project?: { id?: string; code?: string; name?: string },
  extra?: { trackingCode?: string; optionShort?: string; phase?: string; action?: string; status?: string; excelFilename?: string }
): string =>
  `${REVISION_CHANGE_PREFIX} purpose=${purpose}; code=${code}; version=${version || ""}; project_id=${project?.id || ""}; project_code=${project?.code || ""}; project_name=${project?.name || ""}; tracking_code=${extra?.trackingCode || ""}; option_short=${extra?.optionShort || ""}; phase=${extra?.phase || ""}; action=${extra?.action || ""}; status=${extra?.status || ""}; excel_filename=${extra?.excelFilename || ""}; source=excel_export`;

const normalizePurposeKey = (purpose: string): string =>
  purpose === "comment_review_approval_information" ? "comment_review_approval_info" : purpose;

const matchesProjectScope = (
  parsed: RevisionMeta,
  projectScope?: { projectId?: string; projectCode?: string; projectName?: string }
): boolean => {
  const selectedProjectId = (projectScope?.projectId || "").trim();
  const selectedProjectCode = (projectScope?.projectCode || "").trim();
  const selectedProjectName = (projectScope?.projectName || "").trim().toLowerCase();

  if (!selectedProjectId && !selectedProjectCode && !selectedProjectName) {
    return true;
  }

  const parsedProjectId = (parsed.project_id || "").trim();
  const parsedProjectCode = (parsed.project_code || "").trim();
  const parsedProjectName = (parsed.project_name || "").trim().toLowerCase();
  return (
    (selectedProjectId && parsedProjectId === selectedProjectId) ||
    (selectedProjectCode && parsedProjectCode === selectedProjectCode) ||
    (selectedProjectName && parsedProjectName === selectedProjectName)
  );
};

const matchesRevisionLogProjectScope = (
  entry: VDSRevisionLogEntry,
  projectScope?: { projectId?: string; projectCode?: string; projectName?: string }
): boolean => {
  const selectedProjectId = (projectScope?.projectId || "").trim();
  const selectedProjectCode = (projectScope?.projectCode || "").trim();
  const selectedProjectName = (projectScope?.projectName || "").trim().toLowerCase();

  if (!selectedProjectId && !selectedProjectCode && !selectedProjectName) {
    return true;
  }

  const entryProjectId = String(entry.project_id || "").trim();
  const entryProjectCode = String(entry.project_code || "").trim();
  const entryProjectName = String(entry.project_name || "").trim().toLowerCase();

  return (
    (selectedProjectId && entryProjectId === selectedProjectId) ||
    (selectedProjectCode && entryProjectCode === selectedProjectCode) ||
    (selectedProjectName && entryProjectName === selectedProjectName)
  );
};

const getNextRevisionCode = (
  purpose: string,
  versions: ValvesheetRecord["versions"] | undefined,
  projectScope?: { projectId?: string; projectCode?: string; projectName?: string }
): string => {
  const normalizedPurpose = normalizePurposeKey(purpose);
  const rule = revisionRuleByPurpose[normalizedPurpose];
  if (!rule) return "";

  const usageCountForPurpose = (versions || []).reduce((count, entry) => {
    const parsed = parseRevisionChange(entry.changes || "");
    if (!parsed || normalizePurposeKey(parsed.purpose) !== normalizedPurpose) return count;
    const parsedAction = String(parsed.action || "").toLowerCase();
    if (parsedAction && parsedAction !== "submitted" && parsedAction !== "void") return count;
    return matchesProjectScope(parsed, projectScope) ? count + 1 : count;
  }, 0);

  if (rule.type === "fixed") {
    return rule.value;
  }

  if (rule.type === "idc_transition") {
    return usageCountForPurpose === 0 ? "A0" : `R${usageCountForPurpose - 1}`;
  }

  const nextValue = rule.start + usageCountForPurpose;
  const numberText = rule.pad ? String(nextValue).padStart(rule.pad, "0") : String(nextValue);
  return `${rule.prefix}${numberText}`;
};

const getNextRevisionCodeFromLogs = (
  purpose: string,
  logs: VDSRevisionLogEntry[] | undefined
): string => {
  const normalizedPurpose = normalizePurposeKey(purpose);
  const rule = revisionRuleByPurpose[normalizedPurpose];
  if (!rule) return "";

  const usageCountForPurpose = (logs || []).reduce((count, entry) => {
    return normalizePurposeKey(entry.option_name) === normalizedPurpose ? count + 1 : count;
  }, 0);

  if (rule.type === "fixed") {
    return rule.value;
  }

  if (rule.type === "idc_transition") {
    return usageCountForPurpose === 0 ? "A0" : `R${usageCountForPurpose - 1}`;
  }

  const nextValue = rule.start + usageCountForPurpose;
  const numberText = rule.pad ? String(nextValue).padStart(rule.pad, "0") : String(nextValue);
  return `${rule.prefix}${numberText}`;
};

type ContractPhase = "pre_contract" | "post_contract";

const normalizePhaseVersion = (version?: string): ContractPhase | "" => {
  if (!version) return "";
  if (version === "pre_contract" || version === "pre_award") return "pre_contract";
  if (version === "post_contract" || version === "post_award") return "post_contract";
  return "";
};

const phasePurposeOrder: Record<ContractPhase, string[]> = {
  pre_contract: [
    "inter_discipline_check",
    "comment_review_approval_rfq",
    "proposal_tender_aff",
    "pre_award_information",
  ],
  post_contract: [
    "comment_review_approval_info",
    "afc_purchase_pos",
    "as_built_iff",
    "post_award_information",
  ],
};

const inferPhaseFromPurpose = (purpose: string): ContractPhase | null => {
  const normalizedPurpose = normalizePurposeKey(purpose);
  if (phasePurposeOrder.pre_contract.includes(normalizedPurpose)) return "pre_contract";
  if (phasePurposeOrder.post_contract.includes(normalizedPurpose)) return "post_contract";
  return null;
};

const getPhaseProgressState = (
  phase: ContractPhase,
  versions: ValvesheetRecord["versions"] | undefined,
  projectScope?: { projectId?: string; projectCode?: string; projectName?: string }
): { allowedPurposes: string[]; suggestedPurpose: string; currentPurpose: string; isTerminal: boolean } => {
  const phaseOrder = phasePurposeOrder[phase];
  const latestByPurpose = new Map<string, { status: string }>();

  (versions || []).forEach((entry) => {
    const parsed = parseRevisionChange(entry.changes || "");
    if (!parsed || parsed.purpose === "void_or_cancelled") return;
    if (!matchesProjectScope(parsed, projectScope)) return;
    const normalizedPurpose = normalizePurposeKey(parsed.purpose);
    const entryPhase = normalizePhaseVersion(parsed.version) || inferPhaseFromPurpose(normalizedPurpose);
    if (entryPhase !== phase) return;
    latestByPurpose.set(normalizedPurpose, {
      status: String(entry.status || parsed.status || "").toLowerCase(),
    });
  });

  const isStepCompleted = (purpose: string, status: string): boolean => {
    if (reviewStepPurposes.has(purpose)) {
      return status === "reviewed" || status === "approved";
    }
    return status === "approved";
  };

  for (const purpose of phaseOrder) {
    const latest = latestByPurpose.get(purpose);
    if (!latest || !isStepCompleted(purpose, latest.status)) {
      return {
        allowedPurposes: [purpose, "void_or_cancelled"],
        suggestedPurpose: purpose,
        currentPurpose: purpose,
        isTerminal: false,
      };
    }
  }

  const terminalPurpose = phaseOrder[phaseOrder.length - 1];
  return {
    allowedPurposes: ["void_or_cancelled"],
    suggestedPurpose: terminalPurpose,
    currentPurpose: terminalPurpose,
    isTerminal: true,
  };
};

const isPurposeReviewStep = (purpose: string): boolean =>
  reviewStepPurposes.has(normalizePurposeKey(purpose));

const getPendingStatusForPurpose = (purpose: string): "pending_review" | "pending_approval" =>
  isPurposeReviewStep(purpose) ? "pending_review" : "pending_approval";

const buildTrackingCode = (
  projectId: string,
  vdsNumber: string,
  purpose: string,
  revisionCode: string
): string => {
  const short = optionShortCodeByPurpose[normalizePurposeKey(purpose)] || "GEN";
  return `${projectId || "NO_PROJECT"}-${vdsNumber || "NO_VDS"}-${short}-${revisionCode || "NA"}`;
};

const buildExcelFilename = (
  projectCode: string,
  vdsNumber: string,
  purpose: string,
  revisionCode: string,
  isDraft: boolean
): string => {
  const short = optionShortCodeByPurpose[normalizePurposeKey(purpose)] || "GEN";
  const base = `${projectCode || "NO_PROJECT"}_${vdsNumber || "NO_VDS"}_${short}_${revisionCode || "NA"}`;
  return `${base}${isDraft ? "_DRAFT" : ""}.xlsx`;
};

const getLatestScopedRevisionMeta = (
  versions: ValvesheetRecord["versions"] | undefined,
  projectScope?: { projectId?: string; projectCode?: string; projectName?: string }
): RevisionMeta | null => {
  const allRevisionMetas = [...(versions || [])]
    .reverse()
    .map((entry) => parseRevisionChange(entry.changes || ""))
    .filter((meta): meta is RevisionMeta => Boolean(meta));
  const scoped = allRevisionMetas.find((meta) => matchesProjectScope(meta, projectScope));
  if (scoped) return scoped;
  const hasExplicitProjectScope = Boolean(
    (projectScope?.projectId || "").trim() ||
    (projectScope?.projectCode || "").trim() ||
    (projectScope?.projectName || "").trim()
  );
  return hasExplicitProjectScope ? null : allRevisionMetas[0] || null;
};

const getRevisionCountForPurpose = (
  purpose: string,
  versions: ValvesheetRecord["versions"] | undefined,
  projectScope?: { projectId?: string; projectCode?: string; projectName?: string }
): number =>
  (versions || []).reduce((count, entry) => {
    const parsed = parseRevisionChange(entry.changes || "");
    if (!parsed) return count;
    if (normalizePurposeKey(parsed.purpose) !== normalizePurposeKey(purpose)) return count;
    const parsedAction = String(parsed.action || "").toLowerCase();
    if (parsedAction && parsedAction !== "submitted" && parsedAction !== "void") return count;
    return matchesProjectScope(parsed, projectScope) ? count + 1 : count;
  }, 0);

const legacyAwardPhaseMessage = "Is this project Pre-Contract or Post-Contract?";

export default function DatasheetGeneratorPage() {
  const [formData, setFormData] = useState(defaultFormData);
  // ✅ ADD HERE
  const [projectError, setProjectError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [validationStatus, setValidationStatus] = useState<string | null>(null);
  const [openVdsSelect, setOpenVdsSelect] = useState(false);
  const [vdsSuggestions, setVdsSuggestions] = useState<VDSSuggestionItem[]>([]);
  const [valveTypeTemplates, setValveTypeTemplates] = useState<ValveTypeTemplatesResponse | null>(null);
  const [activeTemplateKey, setActiveTemplateKey] = useState<string>("BALL");
  const [activeFields, setActiveFields] = useState<Set<string>>(new Set()); // Fields returned from ML API
  const [mlData, setMlData] = useState<Record<string, string>>({}); // Raw ML data for dynamic rendering
  const [vdsInput, setVdsInput] = useState("");
  const [currentValvesheet, setCurrentValvesheet] = useState<ValvesheetRecord | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [selectedPurposeOfIssue, setSelectedPurposeOfIssue] = useState<string>("");
  const [allProjects, setAllProjects] = useState<ProjectInfo[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, userRole } = useAuth();
  const roleCode = getRoleCode(userRole, user);
  const canSendForApproval = canGenerateDatasheet(roleCode);

  // New state for Project comboboxes
  const [openProjectNameCombo, setOpenProjectNameCombo] = useState(false);
  const [projectNameSearch, setProjectNameSearch] = useState('');
  const [openProjectCodeCombo, setOpenProjectCodeCombo] = useState(false);
  const [projectCodeSearch, setProjectCodeSearch] = useState('');

  // Fetch all projects on mount; keep project unselected until user chooses
  useEffect(() => {
    if (!USER_MGMT_API_URL) return;
    const fetchProjects = async () => {
      try {
        const response = await authService.authenticatedFetch(`${USER_MGMT_API_URL}/projects`);
        if (!response.ok) return;
        const projects = await response.json();
        const mapped: ProjectInfo[] = projects.map((p: any) => ({
          project_id: p.project_id,
          project_name: p.project_name,
          sap_project_code: p.sap_project_code,
        }));
        setAllProjects(mapped);
      } catch {
        // Non-critical — project dropdowns will just be empty
      }
    };
    fetchProjects();
  }, []);

  // Synchronize Project Name/Code search with selected project
  useEffect(() => {
    const currentProject = allProjects.find(p => p.project_id === selectedProjectId);
    if (currentProject) {
      setProjectNameSearch(currentProject.project_name);
      setProjectCodeSearch(currentProject.sap_project_code);
    } else {
      setProjectNameSearch('');
      setProjectCodeSearch('');
    }
  }, [selectedProjectId, allProjects]);

  const selectedProject = allProjects.find((p) => p.project_id === selectedProjectId) || null;
  const normalizedSelectedPhase = normalizePhaseVersion(selectedVersion);
  const isAwardVersionSelected = Boolean(normalizedSelectedPhase);
  const selectedPurposeOptions = normalizedSelectedPhase
    ? purposeOfIssueOptionsByVersion[normalizedSelectedPhase] || []
    : [];
  const versionByPurpose = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(purposeOfIssueOptionsByVersion).forEach(([versionKey, options]) => {
      options.forEach((option) => {
        if (!map[option.value]) {
          map[option.value] = versionKey;
        }
      });
    });
    map["comment_review_approval_information"] = "post_contract"; // legacy support in history
    map["post_award_information"] = "post_contract"; // legacy support in history
    return map;
  }, []);
  const purposeLabelByValue = useMemo(() => {
    const map: Record<string, string> = {};
    Object.values(purposeOfIssueOptionsByVersion).forEach((options) => {
      options.forEach((option) => {
        map[option.value] = option.label;
      });
    });
    return map;
  }, []);
  const projectScope = useMemo(
    () => ({
      projectId: selectedProjectId || undefined,
      projectCode: selectedProject?.sap_project_code || currentValvesheet?.project_code || undefined,
      projectName: selectedProject?.project_name || currentValvesheet?.project_name || undefined,
    }),
    [selectedProjectId, selectedProject?.sap_project_code, selectedProject?.project_name, currentValvesheet?.project_code, currentValvesheet?.project_name]
  );
  const phaseProgressState = useMemo(() => {
    if (!normalizedSelectedPhase) return null;
    return getPhaseProgressState(normalizedSelectedPhase, currentValvesheet?.versions, projectScope);
  }, [normalizedSelectedPhase, currentValvesheet?.versions, projectScope]);
  const filteredPurposeOptions = phaseProgressState
    ? selectedPurposeOptions.filter((option) =>
        phaseProgressState.allowedPurposes.includes(normalizePurposeKey(option.value))
      )
    : selectedPurposeOptions;
  const previewRevisionCode = selectedPurposeOfIssue
    ? getNextRevisionCode(selectedPurposeOfIssue, currentValvesheet?.versions, projectScope)
    : "";
  const suggestedPurposeCode =
    phaseProgressState?.suggestedPurpose
      ? getNextRevisionCode(phaseProgressState.suggestedPurpose, currentValvesheet?.versions, projectScope)
      : "";
  const latestScopedRevisionMeta = useMemo(
    () => getLatestScopedRevisionMeta(currentValvesheet?.versions, projectScope),
    [currentValvesheet?.versions, projectScope]
  );
  const currentWorkflowPurpose = phaseProgressState?.currentPurpose || selectedPurposeOfIssue || "";
  const latestWorkflowPurpose = normalizePurposeKey(latestScopedRevisionMeta?.purpose || "");
  const currentWorkflowRevisionCount = currentWorkflowPurpose
    ? getRevisionCountForPurpose(currentWorkflowPurpose, currentValvesheet?.versions, projectScope)
    : 0;
  const currentWorkflowRevisionCode =
    latestScopedRevisionMeta?.code && latestWorkflowPurpose === currentWorkflowPurpose
      ? latestScopedRevisionMeta.code
      : (currentWorkflowPurpose ? getNextRevisionCode(currentWorkflowPurpose, currentValvesheet?.versions, projectScope) : "");
  const currentWorkflowTrackingCode =
    latestScopedRevisionMeta?.tracking_code && latestWorkflowPurpose === currentWorkflowPurpose
      ? latestScopedRevisionMeta.tracking_code
      : "Not yet generated";
  const isVoidLocked =
    (currentValvesheet?.status || "").toLowerCase() === "void" ||
    currentWorkflowRevisionCode === "XX";
  const sendActionLabel = selectedPurposeOfIssue === "void_or_cancelled"
    ? "Mark as Void"
    : isPurposeReviewStep(selectedPurposeOfIssue || phaseProgressState?.currentPurpose || "")
      ? "Send for Review"
      : "Send for Approval";

  useEffect(() => {
    if (!isAwardVersionSelected) {
      setSelectedPurposeOfIssue("");
    }
  }, [isAwardVersionSelected]);

  useEffect(() => {
    if (!selectedPurposeOfIssue) return;
    if (!selectedPurposeOptions.some((option) => option.value === selectedPurposeOfIssue)) {
      setSelectedPurposeOfIssue("");
    }
  }, [selectedPurposeOfIssue, selectedPurposeOptions]);

  useEffect(() => {
    if (!isAwardVersionSelected || !phaseProgressState) return;
    const normalizedSelectedPurpose = normalizePurposeKey(selectedPurposeOfIssue);
    if (
      !selectedPurposeOfIssue ||
      !phaseProgressState.allowedPurposes.includes(normalizedSelectedPurpose)
    ) {
      setSelectedPurposeOfIssue(phaseProgressState.suggestedPurpose);
    }
  }, [isAwardVersionSelected, phaseProgressState, selectedPurposeOfIssue]);

  useEffect(() => {
    if (!currentValvesheet?.versions?.length) return;
    const allRevisionMetas = [...currentValvesheet.versions]
      .reverse()
      .map((entry) => parseRevisionChange(entry.changes || ""))
      .filter((meta): meta is RevisionMeta => Boolean(meta));
    const latestScopedMeta = allRevisionMetas.find((meta) => matchesProjectScope(meta, projectScope));
    const hasExplicitProjectScope = Boolean(
      (projectScope.projectId || "").trim() ||
      (projectScope.projectCode || "").trim() ||
      (projectScope.projectName || "").trim()
    );
    const latestRevisionMeta = latestScopedMeta || (hasExplicitProjectScope ? null : allRevisionMetas[0]);

    if (!latestRevisionMeta) return;
    const normalizedVersion = normalizePhaseVersion(latestRevisionMeta.version);
    const resolvedVersion =
      normalizedVersion
        ? normalizedVersion
        : versionByPurpose[latestRevisionMeta.purpose];

    if (resolvedVersion && !selectedVersion) {
      setSelectedVersion(resolvedVersion);
    }
  }, [currentValvesheet, versionByPurpose, selectedProjectId, selectedProject?.sap_project_code, selectedProject?.project_name, selectedVersion]);

  // Fetch valve type templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await api.getValveTypeTemplates();
        setValveTypeTemplates(response);
        setActiveTemplateKey(response.default_template);
      } catch (error) {
        console.error("Failed to fetch valve type templates:", error);
      }
    };
    fetchTemplates();
  }, []);

  // Debounced VDS suggestions (200ms)
  useEffect(() => {
    if (!vdsInput || vdsInput.length === 0) {
      setVdsSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await api.getVdsSuggestions(vdsInput);
        setVdsSuggestions(response.suggestions);
      } catch {
        setVdsSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [vdsInput]);

  const refreshValvesheetStatus = useCallback(async (vdsNumber: string) => {
    if (!vdsNumber) {
      setCurrentValvesheet(null);
      return null;
    }
    try {
      const record = await api.getValvesheet(vdsNumber);
      setCurrentValvesheet(record);
      return record;
    } catch {
      setCurrentValvesheet(null);
      return null;
    }
  }, []);

  // Auto-switch template when valve type changes
  useEffect(() => {
    if (formData.valveType) {
      setActiveTemplateKey(resolveTemplateKey(formData.valveType));
    }
  }, [formData.valveType]);

  const updateField = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Map API response to form data (legacy rule-based endpoint)
  const mapDatasheetToForm = useCallback((data: FlatDatasheetResponse) => {
    const d = data.data ?? {};

    const str = (key: string): string => {
      const val = d[key];
      if (val === null || val === undefined || val === "-") return "";
      return String(val);
    };

    const mapValveType = (valveTypeStr: string): string => {
      const lower = valveTypeStr.toLowerCase();
      if (lower.includes("ball")) return "ball";
      if (lower.includes("gate")) return "gate";
      if (lower.includes("globe")) return "globe";
      if (lower.includes("check")) return "check";
      if (lower.includes("double") || lower.includes("dbb")) return "dbb";
      if (lower.includes("needle")) return "needle";
      if (lower.includes("butterfly")) return "butterfly";
      return "ball";
    };

    const mapBoreType = (valveTypeStr: string): string => {
      const lower = valveTypeStr.toLowerCase();
      if (lower.includes("full")) return "full";
      if (lower.includes("reduced")) return "reduced";
      return "full";
    };

    const resolvedValveType = mapValveType(str("valve_type"));

    setFormData({
      vdsNumber: data.vds_no,
      pipingClass: str("piping_class"),
      sizeRange: str("size_range"),
      valveType: resolvedValveType,
      boreType: mapBoreType(str("valve_type")),
      service: str("service"),
      valveStandard: str("valve_standard"),
      pressureClass: str("pressure_class"),
      designPressure: str("design_pressure"),
      corrosionAllowance: str("corrosion_allowance"),
      sourService: str("sour_service"),
      endConnection: str("end_connections"),
      faceToFace: str("face_to_face"),
      bodyConstruction: str("body_construction"),
      ballType: str("ball_construction"),
      stemType: str("stem_construction"),
      seatType: str("seat_construction"),
      discConstruction: str("disc_construction"),
      wedgeConstruction: str("wedge_construction"),
      shaftConstruction: str("shaft_construction"),
      backSeatConstruction: str("back_seat_construction"),
      packingConstruction: str("packing_construction"),
      bonnetConstruction: str("bonnet_construction"),
      locks: str("locks"),
      lockable: true,
      operationMode: str("operation"),
      bodyMaterial: str("body_material"),
      ballMaterial: str("ball_material"),
      seatMaterial: str("seat_material"),
      sealMaterial: str("seal_material"),
      stemMaterial: str("stem_material"),
      glandMaterial: str("gland_material"),
      glandPacking: str("gland_packing"),
      leverMaterial: str("lever_handwheel"),
      springMaterial: str("spring_material"),
      gasketMaterial: str("gaskets"),
      boltMaterial: str("bolts"),
      nutMaterial: str("nuts"),
      discMaterial: str("disc_material"),
      wedgeMaterial: str("wedge_material"),
      trimMaterial: str("trim_material"),
      shaftMaterial: str("shaft_material"),
      needleMaterial: str("needle_material"),
      hingePinMaterial: str("hinge_pin_material"),
      shellTestPressure: str("hydrotest_shell"),
      closureTestPressure: str("hydrotest_closure"),
      pneumaticTestPressure: str("pneumatic_test"),
      leakageRate: str("leakage_rate"),
      materialCertification: str("material_certification"),
      fireRating: str("fire_rating"),
      inspectionStandard: str("inspection_testing"),
      sourServiceReq: str("sour_service").toLowerCase().includes("nace") ? "nace-mr0175" : "none",
      notes: "",
    });

    setActiveTemplateKey(resolveTemplateKey(resolvedValveType));

    setCompletionPercentage(data.completion_percentage);
    setValidationStatus("valid");
    setIsDataLoaded(true);
  }, []);

  // Map ML prediction response to form data (only populates returned fields)
  const mapMLPredictionToForm = useCallback((data: MLFlatPredictionResponse) => {
    const d = data.data ?? {};

    // DEBUG: Check if notes is in the response
    console.log("[DEBUG NOTES] Full response keys:", Object.keys(data));
    console.log("[DEBUG NOTES] data.data keys:", Object.keys(d));
    console.log("[DEBUG NOTES] data.data.notes:", d["notes"]);
    console.log("[DEBUG NOTES] data.data.sour_service:", d["sour_service"]);

    setMlData(d);

    const returnedFields = new Set(Object.keys(d));
    setActiveFields(returnedFields);

    const str = (key: string): string => {
      const val = d[key];
      if (val === null || val === undefined || val === "-") return "";
      return String(val);
    };

    const mapValveType = (valveTypeStr: string): string => {
      const lower = valveTypeStr.toLowerCase();
      if (lower.includes("ball")) return "ball";
      if (lower.includes("gate")) return "gate";
      if (lower.includes("globe")) return "globe";
      if (lower.includes("check")) return "check";
      if (lower.includes("double") || lower.includes("dbb")) return "dbb";
      if (lower.includes("needle")) return "needle";
      if (lower.includes("butterfly")) return "butterfly";
      return "ball";
    };

    const mapBoreType = (valveTypeStr: string): string => {
      const lower = valveTypeStr.toLowerCase();
      if (lower.includes("full")) return "full";
      if (lower.includes("reduced")) return "reduced";
      return "full";
    };

    const resolvedValveType = mapValveType(str("valve_type"));

    // Build form data, only setting fields that are returned from ML
    const notesFromApi = str("notes");
    const newFormData = {
      ...defaultFormData,
      vdsNumber: data.vds_no ?? "",
      pipingClass: str("piping_class"),
      sizeRange: str("size_range"),
      valveType: resolvedValveType,
      boreType: mapBoreType(str("valve_type")),
      service: str("service"),
      valveStandard: str("valve_standard"),
      pressureClass: str("pressure_class"),
      designPressure: str("design_pressure"),
      corrosionAllowance: str("corrosion_allowance"),
      sourService: str("sour_service"),
      endConnection: str("end_connections"),
      faceToFace: str("face_to_face"),
      bodyConstruction: str("body_construction"),
      ballType: str("ball_construction"),
      stemType: str("stem_construction"),
      seatType: str("seat_construction"),
      discConstruction: str("disc_construction"),
      wedgeConstruction: str("wedge_construction"),
      shaftConstruction: str("shaft_construction"),
      backSeatConstruction: str("back_seat_construction"),
      packingConstruction: str("packing_construction"),
      bonnetConstruction: str("bonnet_construction"),
      locks: str("locks"),
      lockable: true,
      operationMode: str("operation"),
      bodyMaterial: str("body_material"),
      ballMaterial: str("ball_material"),
      seatMaterial: str("seat_material"),
      sealMaterial: str("seal_material"),
      stemMaterial: str("stem_material"),
      glandMaterial: str("gland_material"),
      glandPacking: str("gland_packing"),
      leverMaterial: str("lever_handwheel"),
      springMaterial: str("spring_material"),
      gasketMaterial: str("gaskets"),
      boltMaterial: str("bolts"),
      nutMaterial: str("nuts"),
      discMaterial: str("disc_material"),
      wedgeMaterial: str("wedge_material"),
      trimMaterial: str("trim_material"),
      shaftMaterial: str("shaft_material"),
      needleMaterial: str("needle_material"),
      hingePinMaterial: str("hinge_pin_handwheel"),
      shellTestPressure: str("hydrotest_shell"),
      closureTestPressure: str("hydrotest_closure"),
      pneumaticTestPressure: str("pneumatic_test"),
      leakageRate: str("leakage_rate"),
      materialCertification: str("material_certification"),
      fireRating: str("fire_rating"),
      inspectionStandard: str("inspection_testing"),
      sourServiceReq: str("sour_service").toLowerCase().includes("nace") ? "nace-mr0175" : "none",
      notes: notesFromApi,
    };

    setFormData((prev) => ({
      ...newFormData,
      // Preserve user-entered notes when backend response has blank notes.
      notes: notesFromApi || prev.notes || "",
    }));

    setActiveTemplateKey(resolveTemplateKey(resolvedValveType));

    const totalFields = returnedFields.size;
    const populatedFields = Object.values(d).filter(v => v !== "" && v !== null && v !== undefined && v !== "-").length;
    setCompletionPercentage((populatedFields / totalFields) * 100);
    setValidationStatus("valid");
    setIsDataLoaded(true);
  }, []);

  // Fetch datasheet from ML API (production endpoint)
  const fetchDatasheet = useCallback(async (vdsNo: string) => {
    if (!isLikelyCompleteVDS(vdsNo)) {
      setFetchError(null);
      return;
    }

    setIsFetching(true);
    setFetchError(null);

    try {
      // Use ML prediction endpoint (returns only valve-type-specific fields)
      const mlPrediction = await api.getMLPrediction(vdsNo);
      const enrichedData = await api.mergeMaterialsFromAgent(
        vdsNo,
        { ...(mlPrediction.data ?? {}) },
        fieldCategories.materials,
      );
      mapMLPredictionToForm({ ...mlPrediction, data: enrichedData });
      setOpenVdsSelect(false);
      const record = await refreshValvesheetStatus(vdsNo.toUpperCase());
      const savedNotes = (() => {
        const payload = record?.generated_data_json;
        if (payload && typeof payload === "object" && "notes" in (payload as Record<string, unknown>)) {
          const n = (payload as Record<string, unknown>).notes;
          return typeof n === "string" ? n : "";
        }
        return "";
      })();
      if (savedNotes.trim()) {
        setFormData((prev) => ({ ...prev, notes: savedNotes }));
      }

      toast({
        title: "Datasheet Loaded",
        description: `VDS ${vdsNo} data populated from ML prediction`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch datasheet";
      setFetchError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsFetching(false);
    }
  }, [mapMLPredictionToForm, refreshValvesheetStatus, toast]);

  const persistDraft = useCallback(async () => {
    const vds = (formData.vdsNumber || vdsInput || "").toUpperCase().trim();
    if (!isLikelyCompleteVDS(vds)) {
      throw new Error("Complete VDS code is required before saving notes.");
    }

    await api.upsertValvesheet({
      vds_number: vds,
      piping_class: formData.pipingClass || mlData["piping_class"] || "-",
      status: currentValvesheet?.status || "pending",
      requires_revision: Boolean(currentValvesheet?.requires_revision),
      reviewer_comment: currentValvesheet?.reviewer_comment || "",
      generated_data_json: {
        ...mlData,
        notes: formData.notes || "",
      },
      project_name: selectedProject?.project_name || undefined,
      project_code: selectedProject?.sap_project_code || undefined,
      author: user?.full_name || "User",
      change_note: "Draft saved",
    });
    await refreshValvesheetStatus(vds);
  }, [
    currentValvesheet?.requires_revision,
    currentValvesheet?.reviewer_comment,
    currentValvesheet?.status,
    formData.notes,
    formData.pipingClass,
    formData.vdsNumber,
    mlData,
    refreshValvesheetStatus,
    selectedProject?.project_name,
    selectedProject?.sap_project_code,
    user?.full_name,
    vdsInput,
  ]);

  useEffect(() => {
    // Support both location.state (from navigate()) and query param (from URL)
    const vdsFromState = (location.state as { vdsNumber?: string } | null)?.vdsNumber;
    const vdsFromQuery = new URLSearchParams(location.search).get("vds");
    const vdsFromRoute = vdsFromState || vdsFromQuery;
    if (!vdsFromRoute) return;
    const normalized = vdsFromRoute.toUpperCase();
    setVdsInput(normalized);
    updateField("vdsNumber", normalized);
    if (isLikelyCompleteVDS(normalized)) {
      void fetchDatasheet(normalized);
    }
  }, [location.state, location.search, fetchDatasheet]);

  const handleVdsInputChange = (value: string) => {
    setVdsInput(value.toUpperCase());
    setFetchError(null);
    if (!isLikelyCompleteVDS(value) || value.toUpperCase() !== (formData.vdsNumber || "").toUpperCase()) {
      setIsDataLoaded(false);
    }
  };

  const handleFetchDatasheet = () => {
    if (isLikelyCompleteVDS(vdsInput)) {
      setOpenVdsSelect(false);
      fetchDatasheet(vdsInput);
    } else {
      toast({
        title: "Invalid VDS",
        description: "Please complete the full VDS code (including end connection) or select a complete suggestion.",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    setFormData(defaultFormData);
    setVdsInput("");
    setSelectedVersion("");
    setIsDataLoaded(false);
    setFetchError(null);
    setCompletionPercentage(0);
    setValidationStatus(null);
    setActiveFields(new Set()); // Reset active fields
    setMlData({}); // Reset ML data
    setCurrentValvesheet(null);
    setProjectError(null);
    toast({
      title: "Form Reset",
      description: "All fields have been cleared",
    });
  };

  const currentRevisionComment = formData.vdsNumber
    ? currentValvesheet?.reviewer_comment || undefined
    : undefined;
  const currentRequiresRevision = formData.vdsNumber
    ? Boolean(currentValvesheet?.requires_revision)
    : false;
  const validatePhaseAndPurpose = useCallback(
    (
      versionsOverride?: ValvesheetRecord["versions"]
    ): { ok: boolean; description?: string } => {
      const phase = normalizePhaseVersion(selectedVersion);
      if (!phase) {
        return {
          ok: false,
          description: legacyAwardPhaseMessage,
        };
      }
      if (!selectedPurposeOfIssue) {
        return {
          ok: false,
          description: "Select a milestone before continuing.",
        };
      }
      if (selectedPurposeOfIssue === "void_or_cancelled") {
        return { ok: true };
      }

      const phaseOrder = phasePurposeOrder[phase];
      const normalizedPurpose = normalizePurposeKey(selectedPurposeOfIssue);
      if (!phaseOrder.includes(normalizedPurpose)) {
        const fallbackPurpose = phaseOrder[0];
        const fallbackCode = getNextRevisionCode(
          fallbackPurpose,
          versionsOverride ?? currentValvesheet?.versions,
          projectScope
        );
        return {
          ok: false,
          description: `Selected milestone is out of ${phase === "pre_contract" ? "Pre-Contract" : "Post-Contract"} phase. Use ${purposeLabelByValue[fallbackPurpose] || fallbackPurpose} (Rev ${fallbackCode}).`,
        };
      }

      const progress = getPhaseProgressState(
        phase,
        versionsOverride ?? currentValvesheet?.versions,
        projectScope
      );
      if (!progress.allowedPurposes.includes(normalizedPurpose)) {
        const suggestedCode = getNextRevisionCode(
          progress.suggestedPurpose,
          versionsOverride ?? currentValvesheet?.versions,
          projectScope
        );
        return {
          ok: false,
          description: `Phase progression rule: next valid milestone is ${purposeLabelByValue[progress.suggestedPurpose] || progress.suggestedPurpose} (Rev ${suggestedCode}).`,
        };
      }

      return { ok: true };
    },
    [selectedVersion, selectedPurposeOfIssue, currentValvesheet?.versions, projectScope, purposeLabelByValue]
  );

  const handleSendForApproval = async () => {
    if (!formData.vdsNumber) return;

    // 🔴 Project Required Validation
    if (!selectedProjectId) {
      setProjectError("Project is required before sending for approval.");
      toast({
        title: "Project Required",
        description: "Please select a project before sending for approval.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedVersion) {
      toast({
        title: "Project phase required",
        description: "Is this project Pre-Contract or Post-Contract?",
        variant: "destructive",
      });
      return;
    }
    if (isAwardVersionSelected && !selectedPurposeOfIssue) {
      toast({
        title: "Purpose of issue required",
        description: "Select purpose of issue before sending for approval.",
        variant: "destructive",
      });
      return;
    }
    const phaseValidation = validatePhaseAndPurpose();
    if (!phaseValidation.ok) {
      toast({
        title: "Invalid revision progression",
        description: phaseValidation.description || "Revision code progression is out of phase.",
        variant: "destructive",
      });
      return;
    }
    if (selectedPurposeOfIssue === "void_or_cancelled") {
      const ok = window.confirm("This will mark the VDS as VOID (XX) and cannot be undone. Continue?");
      if (!ok) return;
    }

    setProjectError(null); // clear error if valid

    const pendingStatus =
      selectedPurposeOfIssue === "void_or_cancelled"
        ? "void"
        : getPendingStatusForPurpose(selectedPurposeOfIssue);

    const exported = await handleExportExcel({
      download: false,
      quiet: true,
      commitRevision: true,
      submissionStatus: pendingStatus,
      submissionAction: selectedPurposeOfIssue === "void_or_cancelled" ? "void" : "submitted",
    });

    if (!exported) {
      toast({
        title: "Send failed",
        description: "Could not submit datasheet with revision update.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title:
        selectedPurposeOfIssue === "void_or_cancelled"
          ? "Marked as Void"
          : isPurposeReviewStep(selectedPurposeOfIssue)
            ? "Sent for Review"
            : currentRequiresRevision
              ? "Resent for Approval"
              : "Sent for Approval",
      description: `${formData.vdsNumber} moved to Approval & Versions`,
    });
    navigate("/approval", {
      state: {
        vdsNumber: formData.vdsNumber,
      },
    });
  };

  const handleExportPDF = async () => {
    toast({
      title: "Generating PDF...",
      description: `Creating PDF for VDS: ${formData.vdsNumber || "Draft"}`,
    });

    const content = generatePrintableContent();
    const element = document.createElement('div');
    element.innerHTML = content;

    const filename = `valve_datasheet_${formData.vdsNumber || "draft"}.pdf`;

    const pdfBlob: Blob = await html2pdf().from(element).set({
      margin: 10,
      filename,
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).outputPdf('blob');

    // Trigger browser download
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "PDF Ready",
      description: "Your datasheet has been downloaded as PDF",
    });

    // Upload to backend (silent — local download already succeeded)
    try {
      await api.uploadExportFile(pdfBlob, filename, "pdf", formData.vdsNumber || "");
    } catch {
      // Upload failure is non-critical
    }
  };

  const generatePrintableContent = () => {
    // Get dynamic fields from ML data
    const constructionFieldKeys = fieldCategories.construction.filter(key => activeFields.has(key));
    const materialFieldKeys = fieldCategories.materials.filter(key => activeFields.has(key));
    const testingFieldKeys = fieldCategories.testing.filter(key => activeFields.has(key));
    const complianceFieldKeys = fieldCategories.compliance.filter(key => activeFields.has(key));

    // Dynamic construction rows from ML data
    const constructionRows = constructionFieldKeys
      .map(key => {
        const displayName = fieldDisplayNames[key] || key.replace(/_/g, " ");
        const value = mlData[key] || "-";
        return `<div class="field"><span class="label">${displayName}:</span> <span class="value">${value}</span></div>`;
      }).join("\n          ");

    // Dynamic material rows from ML data
    const materialRows = materialFieldKeys
      .map(key => {
        const displayName = fieldDisplayNames[key] || key.replace(/_/g, " ");
        const value = mlData[key] || "-";
        return `<tr><td>${displayName}</td><td>${value}</td></tr>`;
      }).join("\n          ");

    // Dynamic testing rows
    const testingRows = testingFieldKeys
      .map(key => {
        const displayName = fieldDisplayNames[key] || key.replace(/_/g, " ");
        const value = mlData[key] || "-";
        return `<div class="field"><span class="label">${displayName}:</span> <span class="value">${value}</span></div>`;
      }).join("\n          ");

    // Dynamic compliance rows
    const complianceRows = complianceFieldKeys
      .map(key => {
        const displayName = fieldDisplayNames[key] || key.replace(/_/g, " ");
        const value = mlData[key] || "-";
        return `<div class="field"><span class="label">${displayName}:</span> <span class="value">${value}</span></div>`;
      }).join("\n          ");

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Valve Datasheet - ${formData.vdsNumber || "Draft"}</title>
        <style>
          @page { size: A4; margin: 10mm; }
          body { font-family: 'Arial', sans-serif; margin: 10px; color: #333; font-size: 9px; }
          h1 { color: #1e3a5f; border-bottom: 1px solid #1e3a5f; padding-bottom: 4px; margin: 0 0 8px 0; font-size: 14px; }
          h2 { color: #2563eb; margin: 8px 0 4px 0; font-size: 10px; background: #f1f5f9; padding: 3px 6px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; }
          .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 12px; }
          .field { margin-bottom: 2px; line-height: 1.3; }
          .label { font-weight: bold; color: #64748b; }
          .value { color: #1e293b; }
          .header-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
          .badge { background: #22c55e; color: white; padding: 2px 8px; border-radius: 3px; font-size: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 8px; }
          th, td { border: 1px solid #e2e8f0; padding: 3px 5px; text-align: left; }
          th { background: #1e3a5f; color: white; }
          .footer { margin-top: 8px; padding-top: 4px; border-top: 1px solid #e2e8f0; font-size: 8px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="header-info">
          <h1>Valve Datasheet - ${formData.vdsNumber || "DRAFT"}</h1>
          <span class="badge">${isDataLoaded ? "Generated" : "Draft"}</span>
        </div>

        <h2>Basic Information</h2>
        <div class="grid-3">
          <div class="field"><span class="label">Valve Type:</span> <span class="value">${mlData["valve_type"] || "-"}</span></div>
          <div class="field"><span class="label">Piping Class:</span> <span class="value">${mlData["piping_class"] || "-"}</span></div>
          <div class="field"><span class="label">Size Range:</span> <span class="value">${formData.sizeRange || "-"}</span></div>
          <div class="field"><span class="label">Valve Standard:</span> <span class="value">${mlData["valve_standard"] || "-"}</span></div>
          <div class="field"><span class="label">Pressure Class:</span> <span class="value">${mlData["pressure_class"] || "-"}</span></div>
          <div class="field"><span class="label">Design Pressure:</span> <span class="value">${mlData["design_pressure"] || "-"}</span></div>
          <div class="field"><span class="label">End Connection:</span> <span class="value">${mlData["end_connections"] || "-"}</span></div>
          <div class="field"><span class="label">Face to Face:</span> <span class="value">${mlData["face_to_face"] || "-"}</span></div>
          <div class="field"><span class="label">Corrosion Allowance:</span> <span class="value">${mlData["corrosion_allowance"] || "-"}</span></div>
          <div class="field"><span class="label">Service:</span> <span class="value">${formData.service || "-"}</span></div>
          <div class="field"><span class="label">Sour Service:</span> <span class="value">${mlData["sour_service"] || "-"}</span></div>
        </div>

        ${constructionRows ? `<h2>Construction</h2><div class="grid">${constructionRows}</div>` : ""}

        ${materialRows ? `<h2>Materials</h2><table><tr><th>Component</th><th>Material</th></tr>${materialRows}</table>` : ""}

        ${testingRows ? `<h2>Testing</h2><div class="grid">${testingRows}</div>` : ""}

        ${complianceRows ? `<h2>Compliance</h2><div class="grid">${complianceRows}</div>` : ""}

        <div class="footer">
          Generated by ValveFlow Automata • ${new Date().toLocaleDateString()}
        </div>
      </body>
      </html>
    `;
  };

  const handleExportExcel = async (options?: {
    download?: boolean;
    quiet?: boolean;
    commitRevision?: boolean;
    submissionStatus?: ValvesheetRecord["status"];
    submissionAction?: "submitted" | "reviewed" | "approved" | "void";
  }): Promise<boolean> => {
    const shouldDownload = options?.download !== false;
    const quiet = options?.quiet === true;
    const shouldCommitRevision = options?.commitRevision === true;
    const isAwardSelection = Boolean(normalizePhaseVersion(selectedVersion));

    if (!quiet) {
      toast({
        title: "Generating Excel...",
        description: `Creating Excel for VDS: ${formData.vdsNumber || "Draft"}`,
      });
    }
    if (!isDataLoaded) {
      if (!quiet) {
        toast({
          title: "No datasheet loaded",
          description: "Enter and fetch a VDS number before exporting Excel.",
          variant: "destructive",
        });
      }
      return false;
    }
    if (!selectedVersion) {
      if (!quiet) {
        toast({
          title: "Project phase required",
          description: "Is this project Pre-Contract or Post-Contract?",
          variant: "destructive",
        });
      }
      return false;
    }
    if (isAwardSelection && !selectedPurposeOfIssue) {
      if (!quiet) {
        toast({
          title: "Purpose of issue required",
          description: "Select a purpose option to generate Rev No for export.",
          variant: "destructive",
        });
      }
      return false;
    }

    let latestValvesheet = currentValvesheet;
    if (selectedPurposeOfIssue && formData.vdsNumber) {
      try {
        latestValvesheet = await api.getValvesheet(formData.vdsNumber);
        setCurrentValvesheet(latestValvesheet);
      } catch {
        // If lookup fails, fall back to in-memory state.
      }
    }
    const phaseValidation = validatePhaseAndPurpose(latestValvesheet?.versions);
    if (!phaseValidation.ok) {
      if (!quiet) {
        toast({
          title: "Invalid revision progression",
          description: phaseValidation.description || "Revision code progression is out of phase.",
          variant: "destructive",
        });
      }
      return false;
    }

    const revisionProject = {
      id: selectedProjectId || undefined,
      code: selectedProject?.sap_project_code || latestValvesheet?.project_code || undefined,
      name: selectedProject?.project_name || latestValvesheet?.project_name || undefined,
    };
    const scopedProject = {
      projectId: revisionProject.id,
      projectCode: revisionProject.code,
      projectName: revisionProject.name,
    };
    const selectedPhase = normalizePhaseVersion(selectedVersion) || undefined;
    let scopedRevisionLogs: VDSRevisionLogEntry[] = [];
    if (formData.vdsNumber) {
      try {
        const revisionLogRes = await api.listVdsRevisionLogs({
          vds_number: formData.vdsNumber,
          phase: selectedPhase,
          limit: 2000,
        });
        scopedRevisionLogs = revisionLogRes.records.filter((entry) =>
          matchesRevisionLogProjectScope(entry, scopedProject)
        );
      } catch {
        // Fall back to valvesheet version history if revision log lookup fails.
      }
    }

    const normalizedPurpose = normalizePurposeKey(selectedPurposeOfIssue);
    const latestScopedRevisionLogForExport = scopedRevisionLogs[0];
    const latestScopedRevisionMetaForExport = getLatestScopedRevisionMeta(
      latestValvesheet?.versions,
      scopedProject
    );
    const lastIssuedPurposeMeta = selectedPurposeOfIssue
      ? [...(latestValvesheet?.versions || [])]
          .reverse()
          .map((entry) => parseRevisionChange(entry.changes || ""))
          .find(
            (meta): meta is RevisionMeta =>
              Boolean(meta) &&
              normalizePurposeKey(meta.purpose) === normalizedPurpose &&
              matchesProjectScope(meta, scopedProject)
          ) || null
      : null;
    const lastIssuedPurposeLog = selectedPurposeOfIssue
      ? scopedRevisionLogs.find((log) => normalizePurposeKey(log.option_name) === normalizedPurpose) || null
      : null;
    const lastIssuedRevisionCode = lastIssuedPurposeMeta?.code || "";
    const nextRevisionCode = selectedPurposeOfIssue
      ? (scopedRevisionLogs.length > 0
          ? getNextRevisionCodeFromLogs(normalizedPurpose, scopedRevisionLogs)
          : getNextRevisionCode(normalizedPurpose, latestValvesheet?.versions, scopedProject))
      : "";
    const reservedReturnedRevisionCode =
      lastIssuedPurposeMeta?.action === "returned" ? lastIssuedPurposeMeta.code || "" : "";
    const latestScopedRevisionCode =
      latestScopedRevisionLogForExport?.revision_code || latestScopedRevisionMetaForExport?.code || "";
    const revisionCode = shouldCommitRevision
      ? reservedReturnedRevisionCode || nextRevisionCode
      : latestScopedRevisionCode || lastIssuedRevisionCode || nextRevisionCode;
    const optionShort = optionShortCodeByPurpose[normalizedPurpose] || "GEN";
    const trackingCode = shouldCommitRevision
      ? buildTrackingCode(revisionProject.id || "", formData.vdsNumber, normalizedPurpose, revisionCode)
      : lastIssuedPurposeLog?.tracking_code || lastIssuedPurposeMeta?.tracking_code || "Not yet generated";
    const excelFilename = buildExcelFilename(
      revisionProject.code || selectedProject?.sap_project_code || "NO_PROJECT",
      formData.vdsNumber || "DRAFT",
      normalizedPurpose || "general",
      revisionCode || "NA",
      !shouldCommitRevision
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ValveFlow Automata";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Valve Datasheet", {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: "portrait" as const, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      headerFooter: {
        oddFooter: `&L${revisionProject.code || selectedProject?.sap_project_code || "40801-SPE-80000-PP-SP-0001"}&CPage &P of &N&RRev. ${revisionCode || "A"}`,
      },
    });

    sheet.columns = [
      { width: 16 }, // Section
      { width: 20 }, // Field
      { width: 68 }, // Value
      { width: 16 }, // Meta label
      { width: 22 }, // Meta value
    ];

    const allThinBorders = {
      top: { style: "thin" as const },
      left: { style: "thin" as const },
      bottom: { style: "thin" as const },
      right: { style: "thin" as const },
    };

    const styleRow = (row: number) => {
      for (let col = 1; col <= 5; col += 1) {
        const cell = sheet.getCell(row, col);
        cell.border = allThinBorders;
        cell.font = { name: "Calibri", size: 11 };
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      }
    };

    const estimateRowHeight = (text: string, charsPerLine: number, minHeight: number = 26): number => {
      const safe = (text || "").trim();
      if (!safe) return minHeight;
      const lineBreaks = (safe.match(/\n/g) || []).length;
      const wrappedLines = Math.ceil(safe.length / charsPerLine);
      const totalLines = Math.max(1, wrappedLines + lineBreaks);
      return Math.min(240, Math.max(minHeight, totalLines * 15));
    };

    const getTitleValveType = (): string => {
      if (formData.valveType) {
        const mapped = valveTypes.find((v) => v.value === formData.valveType)?.label;
        if (mapped) return mapped.toUpperCase();
      }
      const rawType = String(mlData["valve_type"] || "").toLowerCase();
      if (rawType.includes("ball")) return "BALL VALVE";
      if (rawType.includes("gate")) return "GATE VALVE";
      if (rawType.includes("globe")) return "GLOBE VALVE";
      if (rawType.includes("check")) return "CHECK VALVE";
      if (rawType.includes("needle")) return "NEEDLE VALVE"; // This was the original issue, now fixed in previous step
      if (rawType.includes("butterfly")) return "BUTTERFLY VALVE";
      if (rawType.includes("dbb") || rawType.includes("double")) return "DOUBLE BLOCK & BLEED VALVE";
      return "VALVE";
    };

    const titleValveType = getTitleValveType();
    const vdsNumber = formData.vdsNumber || "DRAFT";

    for (let r = 1; r <= 4; r += 1) styleRow(r);
    sheet.getRow(1).height = 30;
    sheet.getRow(2).height = 30;
    sheet.getRow(3).height = 30;
    sheet.getRow(4).height = 24;

    sheet.mergeCells("A1:B3");
    sheet.mergeCells("C1:C3");
    sheet.getCell("C1").value = `${titleValveType} DATASHEET`;
    sheet.getCell("C1").font = { name: "Calibri", size: 24, bold: true };
    sheet.getCell("C1").alignment = { horizontal: "center", vertical: "middle" };
    sheet.getCell("C1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF2F2F2" },
    };

    sheet.getCell("D1").value = "Project:";
    sheet.getCell("E1").value = selectedProject?.project_name || revisionProject.name || "FPSO P-82 Albacora Leste";
    sheet.getCell("D2").value = "Doc No:";
    sheet.getCell("E2").value = revisionProject.code || selectedProject?.sap_project_code || "40801-SPE-80000-PP-SP-0001";
    sheet.getCell("D3").value = "Rev No:";
    sheet.getCell("E3").value = revisionCode || "A";
    ["D1", "D2", "D3"].forEach((k) => {
      sheet.getCell(k).font = { name: "Calibri", size: 11, bold: true };
      sheet.getCell(k).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF2F2F2" },
      };
    });
    ["E1", "E2", "E3"].forEach((k) => {
      sheet.getCell(k).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF2F2F2" },
      };
    });

    try {
      let logoRes = await fetch("/excel-logo.png");
      if (!logoRes.ok) {
        logoRes = await fetch("/favicon.png");
      }
      if (logoRes.ok) {
        const logoArrayBuffer = await logoRes.arrayBuffer();
        const bytes = new Uint8Array(logoArrayBuffer);
        let binary = "";
        bytes.forEach((b) => { binary += String.fromCharCode(b); });
        const base64 = btoa(binary);
        const logoId = workbook.addImage({
          base64: `data:image/png;base64,${base64}`,
          extension: "png",
        });
        sheet.addImage(logoId, {
          tl: { col: 0.18, row: 0.28 },
          ext: { width: 190, height: 72 },
          editAs: "oneCell",
        });
      }
    } catch {
      // If logo fetch fails, continue export without logo.
    }

    sheet.mergeCells("A4:B4");
    sheet.getCell("A4").value = "VDS No";
    sheet.getCell("C4").value = vdsNumber;
    ["A4", "C4"].forEach((k) => {
      sheet.getCell(k).font = { name: "Calibri", size: 11, bold: true };
      sheet.getCell(k).alignment = { horizontal: "center", vertical: "middle" };
      sheet.getCell(k).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF2F2F2" },
      };
    });

    const readValue = (key: string): string => {
      const raw = mlData[key];
      if (raw === null || raw === undefined) return "-";
      const value = String(raw).trim();
      return value.length > 0 ? value : "-";
    };

    type ExportField = { key: string; label: string };
    const basicFields: ExportField[] = [
      { key: "piping_class", label: "Piping Class" },
      { key: "size_range", label: "Size Range" },
      { key: "valve_type", label: "Valve Type" },
      { key: "service", label: "Service" },
      { key: "valve_standard", label: "Valve Standard" },
      { key: "pressure_class", label: "Pressure Class" },
      { key: "design_pressure", label: "Design Pressure" },
      { key: "corrosion_allowance", label: "Corrosion Allowance" },
      { key: "sour_service", label: "Sour Service Requirements" },
      { key: "end_connections", label: "End Connections" },
      { key: "face_to_face", label: "Face to Face Dimension" },
    ];

    const labelOverrides: Record<string, string> = {
      hydrotest_shell: "Hydrotest Shell Test Pressure",
      hydrotest_closure: "Hydrotest Closure Test Pressure",
      pneumatic_test: "Pneumatic LP Test Pressure",
      inspection_testing: "Inspection - Testing",
      marking_purchaser: "Marking - Purchaser's Specification",
      marking_manufacturer: "Marking - Manufacturer",
      end_connections: "End Connections",
      sour_service: "Sour Service Requirements",
      face_to_face: "Face to Face Dimension",
    };

    const fieldLabel = (key: string): string =>
      labelOverrides[key] || fieldDisplayNames[key] || key.replace(/_/g, " ");

    const writeSimpleRow = (row: number, label: string, value: string, sectionText?: string) => {
      // Default rows: merge A+B to create a single left label column
      sheet.mergeCells(`A${row}:B${row}`);
      sheet.getCell(`A${row}`).value = label;
      sheet.getCell(`C${row}`).value = value;
      sheet.mergeCells(`D${row}:E${row}`);
      styleRow(row);
      const labelCell = sheet.getCell(`A${row}`);
      labelCell.font = { name: "Calibri", size: 11 };
      labelCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };

      // Special row like "Operation" where a section marker is needed in column A
      if (sectionText) sheet.getCell(`A${row}`).value = sectionText;
      sheet.getRow(row).height = estimateRowHeight(value, 88);
    };

    const writeGroupedSectionRow = (row: number, label: string, value: string) => {
      // Construction/Material rows keep A and B separate
      sheet.getCell(`B${row}`).value = label;
      sheet.getCell(`C${row}`).value = value;
      sheet.mergeCells(`D${row}:E${row}`);
      styleRow(row);
      sheet.getRow(row).height = estimateRowHeight(value, 88);
    };

    let row = 5;
    const writtenKeys = new Set<string>();

    const writeSectionRows = (sectionTitle: string, fields: Array<{ key: string; label: string }>) => {
      const visibleFields = fields.filter((f) => activeFields.has(f.key));
      if (visibleFields.length === 0) return;

      const startRow = row;
      visibleFields.forEach((field) => {
        writeSimpleRow(row, field.label, readValue(field.key));
        writtenKeys.add(field.key);
        row += 1;
      });

      sheet.mergeCells(`A${startRow}:A${row - 1}`);
      const sectionCell = sheet.getCell(`A${startRow}`);
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

    basicFields.forEach((field) => {
      if (!activeFields.has(field.key)) return;
      writeSimpleRow(row, field.label, readValue(field.key));
      writtenKeys.add(field.key);
      row += 1;
    });

    const writeSectionRowsFromKeys = (sectionTitle: string, keys: string[]) => {
      const visibleKeys = keys.filter((key) => activeFields.has(key));
      if (visibleKeys.length === 0) return;

      const startRow = row;
      visibleKeys.forEach((key) => {
        writeGroupedSectionRow(row, fieldLabel(key), readValue(key));
        writtenKeys.add(key);
        row += 1;
      });

      sheet.mergeCells(`A${startRow}:A${row - 1}`);
      const sectionCell = sheet.getCell(`A${startRow}`);
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

    const constructionKeys = fieldCategories.construction.filter((k) => k !== "operation");
    writeSectionRowsFromKeys("Construction", constructionKeys);

    if (activeFields.has("operation")) {
      writeSimpleRow(row, "", readValue("operation"), "Operation");
      writtenKeys.add("operation");
      row += 1;
    }

    writeSectionRowsFromKeys("Material", fieldCategories.materials);

    const standaloneKeysInOrder = [
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

    standaloneKeysInOrder.forEach((key) => {
      if (!activeFields.has(key) || writtenKeys.has(key)) return;
      writeSimpleRow(row, fieldLabel(key), readValue(key));
      writtenKeys.add(key);
      row += 1;
    });

    {
      const notesValue = formData.notes.trim();

      if (notesValue) {
        sheet.mergeCells(`A${row}:E${row}`);
        sheet.getCell(`A${row}`).value = "NOTES";
        sheet.getCell(`A${row}`).font = { name: "Calibri", size: 11, bold: true };
        sheet.getCell(`A${row}`).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        sheet.getCell(`A${row}`).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF2F2F2" },
        };
        for (let col = 1; col <= 5; col += 1) {
          sheet.getCell(row, col).border = allThinBorders;
        }
        sheet.getRow(row).height = 24;
        row += 1;

        sheet.mergeCells(`A${row}:E${row}`);
        sheet.getCell(`A${row}`).value = notesValue;
        sheet.getCell(`A${row}`).font = { name: "Calibri", size: 11 };
        sheet.getCell(`A${row}`).alignment = { horizontal: "left", vertical: "top", wrapText: true };
        for (let col = 1; col <= 5; col += 1) {
          sheet.getCell(row, col).border = allThinBorders;
        }
        sheet.getRow(row).height = estimateRowHeight(notesValue, 120, 44);
        row += 1;
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    if (shouldDownload) {
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = excelFilename;
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    if (!quiet) {
      toast({
        title: "Excel Ready",
        description: shouldDownload
          ? shouldCommitRevision
            ? "Submitted version has been downloaded as XLSX"
            : "Draft datasheet has been downloaded as XLSX"
          : "Your datasheet has been prepared as XLSX",
      });
    }

    // Upload to backend (silent — local download already succeeded)
    if (shouldCommitRevision && selectedPurposeOfIssue && formData.vdsNumber) {
      const submittedStatus =
        options?.submissionStatus ||
        (selectedPurposeOfIssue === "void_or_cancelled"
          ? "void"
          : getPendingStatusForPurpose(selectedPurposeOfIssue));
      try {
        const updatedRecord = await api.upsertValvesheet({
          vds_number: formData.vdsNumber,
          piping_class: formData.pipingClass || String(mlData["piping_class"] || "-"),
          status: submittedStatus,
          requires_revision: false,
          reviewer_comment: "",
          generated_data_json: {
            ...mlData,
            notes: formData.notes || "",
          },
          project_name: selectedProject?.project_name || latestValvesheet?.project_name || undefined,
          project_code: selectedProject?.sap_project_code || latestValvesheet?.project_code || undefined,
          author: user?.full_name || user?.name || "Datasheet Generator",
          change_note: buildRevisionChangeNote(
            selectedPurposeOfIssue,
            revisionCode,
            selectedVersion,
            revisionProject,
            {
              trackingCode: trackingCode === "Not yet generated" ? undefined : trackingCode,
              optionShort,
              phase: normalizePhaseVersion(selectedVersion) || undefined,
              action: options?.submissionAction || "submitted",
              status: submittedStatus,
              excelFilename,
            }
          ),
        });
        setCurrentValvesheet(updatedRecord);
      } catch {
        return false;
      }
    }

    try {
      await api.uploadExportFile(blob, excelFilename, "xlsx", formData.vdsNumber || "", {
        project_code: revisionProject.code || selectedProject?.sap_project_code || undefined,
        project_name: revisionProject.name || selectedProject?.project_name || undefined,
        phase: normalizePhaseVersion(selectedVersion) || undefined,
        revision_code: revisionCode || undefined,
      });
    } catch {
      // Upload failure is non-critical
    }
    return true;
  };

  const handleSave = useCallback(async (quiet = false) => {
    try {
      await persistDraft();
      if (!quiet) {
        toast({
          title: "Datasheet Saved",
          description: "Notes and current draft were saved successfully",
        });
      }
    } catch (error) {
      if (!quiet) {
        toast({
          title: "Save failed",
          description: error instanceof Error ? error.message : "Unable to save draft right now.",
          variant: "destructive",
        });
      }
    }
  }, [persistDraft, toast]);

  const handlePrint = () => {
    const printContent = generatePrintableContent();
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const renderStepContent = (stepId: number) => {
    switch (stepId) {
      case 1:
        return (
          <div className={cn("grid grid-cols-1 gap-6", isDataLoaded && "lg:grid-cols-2")}>
            {/* Valve Identification */}
            <Card className="border-border">
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      VDS Number
                    </Label>
                    <div className="relative">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            value={vdsInput ?? ""}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase();
                              handleVdsInputChange(val);
                              setOpenVdsSelect(val.length > 0);
                            }}
                            onFocus={() => setOpenVdsSelect((vdsInput ?? "").length > 0)}
                            placeholder="Type VDS number..."
                            className={cn(
                              "font-mono text-sm",
                              fetchError ? "border-destructive" : isDataLoaded ? "border-green-500" : ""
                            )}
                          />
                          {isFetching && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          {isDataLoaded && !isFetching && (
                            <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                          )}
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={handleFetchDatasheet}
                              disabled={isFetching || !isLikelyCompleteVDS(vdsInput)}
                            >
                              {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Fetch Datasheet</TooltipContent>
                        </Tooltip>
                      </div>
                      {/* Autocomplete dropdown */}
                      {openVdsSelect && vdsInput.length > 0 && vdsSuggestions.length > 0 && (
                        <div className="absolute z-[70] w-full mt-1 bg-popover border rounded-md shadow-lg">
                          <div className="px-3 py-2 text-xs text-muted-foreground border-b bg-muted/30">
                            {vdsSuggestions.length} suggestion{vdsSuggestions.length === 1 ? "" : "s"} • Scroll for more
                          </div>
                          <div className="max-h-[260px] overflow-y-auto overscroll-contain">
                            {vdsSuggestions.map((item, idx) => (
                              <div
                                key={`${item.vds}-${idx}`}
                                className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-white flex items-center justify-between gap-2"
                                onClick={() => {
                                  const vds = item.vds ?? "";
                                  setVdsInput(vds);
                                  updateField("vdsNumber", vds);
                                  if (item.is_complete && vds) {
                                    fetchDatasheet(vds);
                                  }
                                  setOpenVdsSelect(false);
                                }}
                              >
                                <div className="flex items-center gap-2 min-w-0 ">
                                  <span className={cn(
                                    "font-mono shrink-0",
                                    item.source === "generated" && ""
                                  )}>
                                    {item.vds}
                                  </span>
                                  {/* {item.source === "generated" && item.description && (
                                    <span className="text-xs truncate">
                                      {item.description}
                                    </span>
                                  )} */}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {fetchError && (
                      <p className="text-xs text-destructive mt-1">{fetchError}</p>
                    )}
                  </div>
                  {/* Dynamic fields from ML - only show if data loaded */}
                  {isDataLoaded && activeFields.has("valve_type") && (
                    <div className="col-span-2 space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Valve Type
                      </Label>
                      <div className="p-3 bg-muted/30 border rounded-md text-sm font-medium">
                        {mlData["valve_type"] || "-"}
                      </div>
                    </div>
                  )}
                  {isDataLoaded && activeFields.has("piping_class") && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Piping Class
                      </Label>
                      <div className="p-3 bg-muted/30 border rounded-md text-sm">
                        {mlData["piping_class"] || "-"}
                      </div>
                    </div>
                  )}
                  {isDataLoaded && activeFields.has("size_range") && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Size Range
                      </Label>
                      <Input
                        value={formData.sizeRange ?? ""}
                        onChange={(e) => updateField("sizeRange", e.target.value)}
                        placeholder='e.g., 1/2" - 24"'
                      />
                    </div>
                  )}
                  {isDataLoaded && activeFields.has("service") && (
                    <div className="col-span-2 space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Service
                      </Label>
                      <Textarea
                        value={formData.service ?? ""}
                        onChange={(e) => updateField("service", e.target.value)}
                        placeholder="e.g., Cooling Water, Diesel, Steam"
                        className="min-h-[80px] resize-none"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Design Parameters */}
            {isDataLoaded && (
            <Card className="border-border">
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <>
                      {activeFields.has("valve_standard") && (
                        <div className="col-span-2 space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Valve Standard
                          </Label>
                          <div className="p-3 bg-muted/30 border rounded-md text-sm">
                            {mlData["valve_standard"] || "-"}
                          </div>
                        </div>
                      )}
                      {activeFields.has("pressure_class") && (
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Pressure Class
                          </Label>
                          <div className="p-3 bg-muted/30 border rounded-md text-sm">
                            {mlData["pressure_class"] || "-"}
                          </div>
                        </div>
                      )}
                      {activeFields.has("design_pressure") && (
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Design Pressure
                          </Label>
                          <div className="p-3 bg-muted/30 border rounded-md text-sm">
                            {mlData["design_pressure"] || "-"}
                          </div>
                        </div>
                      )}
                      {activeFields.has("corrosion_allowance") && (
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Corrosion Allowance
                          </Label>
                          <div className="p-3 bg-muted/30 border rounded-md text-sm">
                            {mlData["corrosion_allowance"] || "-"}
                          </div>
                        </div>
                      )}
                      {activeFields.has("end_connections") && (
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            End Connection
                          </Label>
                          <div className="p-3 bg-muted/30 border rounded-md text-sm">
                            {mlData["end_connections"] || "-"}
                          </div>
                        </div>
                      )}
                      {activeFields.has("face_to_face") && (
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Face to Face
                          </Label>
                          <div className="p-3 bg-muted/30 border rounded-md text-sm">
                            {mlData["face_to_face"] || "-"}
                          </div>
                        </div>
                      )}
                      {activeFields.has("sour_service") && (
                        <div className="col-span-2 space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Sour Service
                          </Label>
                          <div className="p-3 bg-muted/30 border rounded-md text-sm">
                            {mlData["sour_service"] || "-"}
                          </div>
                        </div>
                      )}
                    </>
                </div>
              </CardContent>
            </Card>
            )}
          </div>
        );

      case 2: {
        // Get construction fields dynamically from ML data (including locks and operation)
        const constructionFieldKeys = fieldCategories.construction.filter(key => activeFields.has(key));

        return (
          <Card className="border-border">
            <CardContent>
              {!isDataLoaded ? (
                <div className="text-sm text-muted-foreground">-</div>
              ) : constructionFieldKeys.length === 0 ? (
                <div className="text-sm text-muted-foreground italic">
                  No construction fields returned for this valve type
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {constructionFieldKeys.map((fieldKey) => {
                    const displayName = fieldDisplayNames[fieldKey] || fieldKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                    const value = mlData[fieldKey] || "";
                    return (
                      <div key={fieldKey} className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {displayName}
                        </Label>
                        <div className="p-3 bg-muted/30 border rounded-md text-sm">
                          {value || "-"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      }

      case 3: {
        const materialFieldKeys = fieldCategories.materials.filter(key => activeFields.has(key));

        if (!isDataLoaded) {
          return (
            <Card className="border-border">
              <CardContent>
                <div className="text-sm text-muted-foreground">-</div>
              </CardContent>
            </Card>
          );
        }

        if (materialFieldKeys.length === 0) {
          return (
            <Card className="border-border">
              <CardContent>
                <div className="text-sm text-muted-foreground italic">
                  The ML prediction did not return any material fields for this VDS number.
                </div>
              </CardContent>
            </Card>
          );
        }

        return (
          <Card className="border-border">
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {materialFieldKeys.map((fieldKey) => {
                  const displayName = fieldDisplayNames[fieldKey] || fieldKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                  const value = mlData[fieldKey] || "";
                  return (
                    <div key={fieldKey} className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {displayName}
                      </Label>
                      <div className="p-3 bg-muted/30 border rounded-md text-sm whitespace-pre-wrap">
                        {value || "-"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      }

      case 4: {
        const complianceFieldKeys = fieldCategories.compliance.filter(key => activeFields.has(key));

        if (!isDataLoaded) {
          return (
            <Card className="border-border">
              <CardContent>
                <div className="text-sm text-muted-foreground">-</div>
              </CardContent>
            </Card>
          );
        }

        if (complianceFieldKeys.length === 0) {
          return (
            <Card className="border-border">
              <CardContent>
                <div className="text-sm text-muted-foreground italic">
                  The ML prediction did not return any compliance fields for this VDS number.
                </div>
              </CardContent>
            </Card>
          );
        }

        return (
          <Card className="border-border">
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {complianceFieldKeys.map((fieldKey) => {
                  const displayName = fieldDisplayNames[fieldKey] || fieldKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                  const value = mlData[fieldKey] || "";
                  return (
                    <div key={fieldKey} className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {displayName}
                      </Label>
                      <div className="p-3 bg-muted/30 border rounded-md text-sm whitespace-pre-wrap">
                        {value || "-"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      }

      case 5: {
        const testingFieldKeys = fieldCategories.testing.filter(key => activeFields.has(key));

        if (!isDataLoaded) {
          return (
            <Card className="border-border">
              <CardContent>
                <div className="text-sm text-muted-foreground">-</div>
              </CardContent>
            </Card>
          );
        }

        if (testingFieldKeys.length === 0) {
          return (
            <Card className="border-border">
              <CardContent>
                <div className="text-sm text-muted-foreground italic">
                  The ML prediction did not return any test fields for this VDS number.
                </div>
              </CardContent>
            </Card>
          );
        }

        return (
          <Card className="border-border">
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {testingFieldKeys.map((fieldKey) => {
                  const displayName = fieldDisplayNames[fieldKey] || fieldKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                  const value = mlData[fieldKey] || "";
                  return (
                    <div key={fieldKey} className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {displayName}
                      </Label>
                      <div className="p-3 bg-muted/30 border rounded-md text-sm">
                        {value || "-"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      }

      case 6:
        return (
          <Card className="border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">General Notes & Remarks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
            <Textarea
              value={formData.notes ?? ""}
              onChange={(e) => updateField("notes", e.target.value.slice(0, NOTES_MAX_LENGTH))}
              onBlur={() => {
                void handleSave(true);
              }}
              maxLength={NOTES_MAX_LENGTH}
              placeholder="Enter project-specific notes, assumptions, and deviations..."
              className="min-h-[200px] resize-none"
            />
            <div className="text-xs text-muted-foreground text-right">
              {formData.notes.length}/{NOTES_MAX_LENGTH}
            </div>
          </CardContent>
        </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-background">
      <AppHeader
        title="Generate Datasheet"
        breadcrumbs={[{ label: "FPSO Prosperity", href: "/" }, { label: "Generate Datasheet" }]}
      />

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6 animate-fade-in">
          {/* Top Header with Status and Actions */}
          <div className="flex items-center justify-between bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{formData.vdsNumber || "Generate Valve Datasheet"}</h2>
                  {isFetching && (
                    <Badge variant="outline" className="text-xs">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Loading...
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {[
                    formData.valveType
                      ? valveTypes.find((v) => v.value === formData.valveType)?.label
                      : null,
                    formData.pipingClass || null,
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={handleReset}>
                <RefreshCcw className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => void handleSave()}>
                <Save className="w-4 h-4" />
                Save
              </Button>
              {/* <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
                <Printer className="w-4 h-4" />
                Print
              </Button> */}
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  void handleExportExcel();
                }}
                disabled={isVoidLocked}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Download Excel
              </Button>

              {isDataLoaded && canSendForApproval && (
                <Button
                  size="sm"
                  onClick={() => void handleSendForApproval()}
                  disabled={isVoidLocked}
                >
                  {sendActionLabel}
                </Button>
              )}


            </div>
          </div>

          
          {isDataLoaded && currentRequiresRevision && currentRevisionComment && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Reviewer requested revision: {currentRevisionComment}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-8">
            {/* Project Specification Section */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center">
                  <FolderKanban className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Project Specification</h3>
                </div>
              </div>
              <Card className="border-border">
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Project Name <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={selectedProjectId}
                        onValueChange={(val) => {
                          setSelectedProjectId(val);
                          if (val) setProjectError(null); // clear error when user selects
                        }}
                      >
                        <SelectTrigger
                          className={cn(
                            projectError && "border-destructive focus:ring-destructive"
                          )}
                        >
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>

                        <SelectContent>
                          {allProjects.map((p) => (
                            <SelectItem key={p.project_id} value={p.project_id}>
                              {p.project_name} - {p.sap_project_code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {projectError && (
                        <p className="text-xs text-destructive">{projectError}</p>
                      )}
                    </div>
                    {/* <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Project Code
                      </Label>
                      <Select
                        value={selectedProjectId}
                        onValueChange={(val) => setSelectedProjectId(val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select project code" />
                        </SelectTrigger>
                        <SelectContent>
                          {allProjects.map((p) => (
                            <SelectItem key={`code-${p.project_id}`} value={p.project_id}>
                              {p.sap_project_code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div> */}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Select Versions Section */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center">
                  <FileCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Select Versions</h3>
                </div>
              </div>
              <Card className="border-border">
                <CardContent className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Select Versions
                  </Label>
                  <Select
                    value={selectedVersion}
                    onValueChange={setSelectedVersion}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select version" />
                    </SelectTrigger>
                    <SelectContent>
                      {awardVersionOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isAwardVersionSelected && (
                    <>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Purpose of Issue
                      </Label>
                      <Select value={selectedPurposeOfIssue} onValueChange={setSelectedPurposeOfIssue}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select purpose of issue" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredPurposeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {phaseProgressState?.suggestedPurpose && (
                        <p className="text-xs text-muted-foreground">
                          {`Suggested next milestone: ${purposeLabelByValue[phaseProgressState.suggestedPurpose] || phaseProgressState.suggestedPurpose} (${suggestedPurposeCode || "-"})`}
                        </p>
                      )}
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {`Next Rev No: ${previewRevisionCode || "-"}`}
                  </p>
                </CardContent>
              </Card>
              {isDataLoaded && (
                <Card className="border-border">
                  <CardContent className="space-y-1">
                    <p className="text-xs"><span className="font-semibold">VDS No:</span> {formData.vdsNumber || "-"}</p>
                    <p className="text-xs"><span className="font-semibold">Current Step:</span> {purposeLabelByValue[currentWorkflowPurpose] || currentWorkflowPurpose || "-"}</p>
                    <p className="text-xs"><span className="font-semibold">Revision Code:</span> {currentWorkflowRevisionCode || "A0 (Pending First Submission)"}</p>
                    <p className="text-xs break-all"><span className="font-semibold">Tracking Code:</span> {isVoidLocked ? "VOID — No further actions allowed" : currentWorkflowTrackingCode}</p>
                    <p className="text-xs"><span className="font-semibold">Version Count:</span> {currentWorkflowRevisionCount}</p>
                  </CardContent>
                </Card>
              )}
            </section>

            {/* API Connection Alert */}
            {!isDataLoaded && !isFetching && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Enter a VDS number (e.g., <code className="bg-muted px-1 rounded">BLRTA1R</code>) to auto-populate fields using ML prediction.
                  Only valve-type-specific fields will be shown.
                </AlertDescription>
              </Alert>
            )}

            {steps
              .filter((step) => isDataLoaded || step.id === 1 || step.id === 6)
              .map((step) => (
              <section key={step.id} className="space-y-3">
                {!( !isDataLoaded && !isFetching ) && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center">
                        {step.id}
                      </div>
                      <div>
                        <h3 className="text-base font-semibold">{step.title}</h3>
                        <p className="text-sm text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                  </div>
                )}
                  {renderStepContent(step.id)}
              </section>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
