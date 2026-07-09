import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Panel } from "@/components/common/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, X, Clock, User, ChevronRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import api, {
  type VDSRevisionLogEntry,
  type ValvesheetRecord,
  type VDSSignature,
  type VDSSignatureType,
  type VDSDecision,
} from "@/services/api";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { canReviewApprovals, getRoleCode, isCreatorRole } from "@/lib/roles";

/** Align with DatasheetGeneratorPage `fieldCategories.materials` — sparse ML/DB rows get values from the agent. */
const REVIEW_MATERIAL_MERGE_KEYS: readonly string[] = [
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

type ApprovalStatus =
  | "pending"
  | "pending_review"
  | "pending_approval"
  | "reviewed"
  | "approved"
  | "void";

type ApprovalItem = {
  id: string;
  tag: string;
  vdsNumber: string;
  projectName: string;
  projectCode: string;
  projectKey: string;
  scopeKey: string;
  phase?: string;
  status: ApprovalStatus;
  pipingClass: string;
  valveType: string;
  submittedAtIso: string;
  submittedAtLabel: string;
  submittedBy: string;
  latestRevisionCode?: string;
  latestRevisionPurpose?: string;
  optionCodes: string[];
  nextPurposeLabel?: string;
  nextPurposeValue?: string;
  requiresRevision?: boolean;
  reviewerComment?: string;
};

type ReviewField = { key: string; label: string; value: string };
type ReviewSection = { id: string; title: string; fields: ReviewField[] };

type VersionEntry = {
  id: string;
  version: number;
  status: ApprovalStatus;
  author: string;
  date: string;
  changes: string;
  revisionCode?: string;
  reviewNote?: string;
};

type RevisionMeta = {
  purpose: string;
  code: string;
  version?: string;
  project_id?: string;
  project_code?: string;
  project_name?: string;
};

type ApprovalRevisionLogEntry = {
  id: string;
  projectKey: string;
  scopeKey: string;
  vdsNumber: string;
  projectName: string;
  projectCode: string;
  phase?: string;
  optionName: string;
  revisionCode: string;
  trackingCode: string;
  action: string;
  status: string;
  createdAt: string;
  createdBy: string;
};

const reviewStepPurposes = new Set<string>([
  "inter_discipline_check",
  "comment_review_approval_rfq",
]);

const phasePurposeOrder: Record<"pre_contract" | "post_contract", string[]> = {
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

const purposeLabels: Record<string, string> = {
  inter_discipline_check: "Inter-discipline check(IDC)/ Squad Check",
  comment_review_approval_rfq: "Issued for Comment / Review / Approval / RFQ",
  proposal_tender_aff: "Issued for Proposal / Tender / Approved for FEED (AFF)",
  pre_award_information: "Issued for Information",
  void_or_cancelled: "Void or Cancelled",
  comment_review_approval_info: "Issued for Comment / Review / Approval / Information",
  comment_review_approval_information: "Issued for Comment / Review / Approval / Information",
  afc_purchase_pos: "Approved for Construction (AFC) / Purchase / Use Approved for Purchase Specification (POS)",
  as_built_iff: "As Built / Issued for Final (IFF)",
  post_award_information: "Issued for Information",
};

const optionShortByPurpose: Record<string, string> = {
  inter_discipline_check: "IDC",
  comment_review_approval_rfq: "CRA",
  proposal_tender_aff: "PTA",
  pre_award_information: "PAI",
  void_or_cancelled: "VOI",
  comment_review_approval_info: "CAI",
  comment_review_approval_information: "CAI",
  afc_purchase_pos: "AFC",
  as_built_iff: "ABI",
  post_award_information: "POI",
};

const ALLOWED_PROJECT_CODES = new Set(["20171", "20187", "20240801"]);
const PROJECT_NAME_TO_CODE: Record<string, string> = {
  "kakinada project": "20171",
  "baracuda fpso bid": "20187",
  "charter and o&m services for fpso project": "20240801",
};
const PROJECT_ID_TO_CODE: Record<string, string> = {
  "FPSO-006": "20171",
  "FPSO-007": "20187",
  "FPSO-008": "20240801",
};

const normalizedProjectCode = (item: {
  projectCode?: string | null;
  projectName?: string | null;
  projectKey?: string | null;
}): string => {
  const code = String(item.projectCode || "").trim();
  if (code && code !== "-") return code;
  const projectKey = String(item.projectKey || "").trim();
  if (projectKey.startsWith("id:")) {
    const projectId = projectKey.slice(3);
    if (PROJECT_ID_TO_CODE[projectId]) {
      return PROJECT_ID_TO_CODE[projectId];
    }
  }
  const name = String(item.projectName || "").trim().toLowerCase();
  return PROJECT_NAME_TO_CODE[name] || "";
};

const projectFilterValue = (item: {
  projectCode?: string | null;
  projectName?: string | null;
  projectKey?: string | null;
}): string => {
  const code = normalizedProjectCode(item);
  const name = String(item.projectName || "").trim().toLowerCase();
  if (code && code !== "-") return `code:${code}`;
  if (name && name !== "-") return `name:${name}`;
  return "project:unknown";
};

const fieldDisplayNames: Record<string, string> = {
  vds_no: "VDS Number",
  valve_type: "Valve Type",
  piping_class: "Piping Class",
  size_range: "Size Range",
  service: "Service",
  valve_standard: "Valve Standard",
  pressure_class: "Pressure Class",
  design_pressure: "Design Pressure",
  corrosion_allowance: "Corrosion Allowance",
  sour_service: "Sour Service",
  end_connections: "End Connections",
  face_to_face: "Face to Face",
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
  hydrotest_shell: "Shell Test Pressure",
  hydrotest_closure: "Closure Test Pressure",
  pneumatic_test: "Pneumatic Test Pressure",
  leakage_rate: "Leakage Rate",
  inspection_testing: "Inspection & Testing",
  material_certification: "Material Certification",
  fire_rating: "Fire Rating",
  marking_purchaser: "Marking (Purchaser)",
  marking_manufacturer: "Marking (Manufacturer)",
  finish: "Finish",
};

const sectionKeys: Array<{ id: string; title: string; keys: string[] }> = [
  {
    id: "basic",
    title: "Basic Info",
    keys: [
      "vds_no",
      "valve_type",
      "piping_class",
      "size_range",
      "service",
      "valve_standard",
      "pressure_class",
      "design_pressure",
      "corrosion_allowance",
      "sour_service",
      "end_connections",
      "face_to_face",
    ],
  },
  {
    id: "construction",
    title: "Construction",
    keys: [
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
      "operation",
    ],
  },
  {
    id: "materials",
    title: "Materials",
    keys: [
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
    ],
  },
  {
    id: "testing",
    title: "Testing",
    keys: [
      "hydrotest_shell",
      "hydrotest_closure",
      "pneumatic_test",
      "leakage_rate",
      "inspection_testing",
    ],
  },
  {
    id: "compliance",
    title: "Compliance",
    keys: [
      "material_certification",
      "fire_rating",
      "marking_purchaser",
      "marking_manufacturer",
      "finish",
    ],
  },
];

const normalizePurpose = (purpose: string): string =>
  purpose === "comment_review_approval_information"
    ? "comment_review_approval_info"
    : purpose;

const parseRevisionMeta = (changes: string): RevisionMeta | null => {
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
  if (!purpose || !code) return null;

  return {
    purpose,
    code,
    version: pairs.find((p) => p.key === "version")?.value,
    project_id: pairs.find((p) => p.key === "project_id")?.value,
    project_code: pairs.find((p) => p.key === "project_code")?.value,
    project_name: pairs.find((p) => p.key === "project_name")?.value,
  };
};

const projectKeyFromMeta = (meta?: {
  project_id?: string;
  project_code?: string;
  project_name?: string;
}): string => {
  if (!meta) return "project:unknown";
  const id = (meta.project_id || "").trim();
  const code = (meta.project_code || "").trim().toLowerCase();
  const name = (meta.project_name || "").trim().toLowerCase();
  if (id) return `id:${id}`;
  if (code) return `code:${code}`;
  if (name) return `name:${name}`;
  return "project:unknown";
};

const projectKeyFromLog = (log: {
  project_id?: string | null;
  project_code?: string | null;
  project_name?: string | null;
}): string => {
  const id = String(log.project_id || "").trim();
  const code = String(log.project_code || "").trim().toLowerCase();
  const name = String(log.project_name || "").trim().toLowerCase();
  if (id) return `id:${id}`;
  if (code) return `code:${code}`;
  if (name) return `name:${name}`;
  return "project:unknown";
};

const scopeKeyFromProjectAndPhase = (projectKey: string, phase?: string | null): string => {
  const normalizedPhase = String(phase || "").trim().toLowerCase() || "unknown";
  return `${projectKey}::${normalizedPhase}`;
};

const inferPhaseFromPurpose = (purpose: string): string => {
  const normalizedPurpose = normalizePurpose(purpose);
  if (
    [
      "inter_discipline_check",
      "comment_review_approval_rfq",
      "proposal_tender_aff",
      "pre_award_information",
    ].includes(normalizedPurpose)
  ) {
    return "pre_contract";
  }
  if (
    [
      "comment_review_approval_info",
      "afc_purchase_pos",
      "as_built_iff",
      "post_award_information",
    ].includes(normalizedPurpose)
  ) {
    return "post_contract";
  }
  return "";
};

const getUpcomingPurpose = (purpose?: string, status?: string): string => {
  const normalizedPurpose = normalizePurpose(purpose || "");
  const phase = inferPhaseFromPurpose(normalizedPurpose);
  if (!phase || !normalizedPurpose) return "";
  const order = phasePurposeOrder[phase as "pre_contract" | "post_contract"];
  const currentIndex = order.indexOf(normalizedPurpose);
  if (currentIndex === -1) return "";
  const normalizedStatus = String(status || "").toLowerCase();
  const isCompleted = reviewStepPurposes.has(normalizedPurpose)
    ? normalizedStatus === "reviewed" || normalizedStatus === "approved"
    : normalizedStatus === "approved";
  if (!isCompleted) return normalizedPurpose;
  return order[currentIndex + 1] || "";
};

const getNextWorkflowPurpose = (purpose?: string, status?: string): string => {
  const normalizedPurpose = normalizePurpose(purpose || "");
  const normalizedStatus = String(status || "").toLowerCase();
  const phase = inferPhaseFromPurpose(normalizedPurpose);
  if (!phase || !normalizedPurpose) return "";

  const order = phasePurposeOrder[phase as "pre_contract" | "post_contract"];
  const currentIndex = order.indexOf(normalizedPurpose);
  if (currentIndex === -1) return "";

  const isCompleted = reviewStepPurposes.has(normalizedPurpose)
    ? normalizedStatus === "reviewed" || normalizedStatus === "approved"
    : normalizedStatus === "approved";

  if (!isCompleted) return "";

  const nextInPhase = order[currentIndex + 1];
  if (nextInPhase) return nextInPhase;

  if (phase === "pre_contract") {
    return phasePurposeOrder.post_contract[0] || "";
  }

  return "";
};

const getInitialRevisionCode = (purpose: string): string => {
  switch (normalizePurpose(purpose)) {
    case "inter_discipline_check":
      return "A0";
    case "comment_review_approval_rfq":
      return "A1";
    case "proposal_tender_aff":
      return "C0";
    case "pre_award_information":
      return "P1";
    case "comment_review_approval_info":
      return "C1";
    case "afc_purchase_pos":
      return "00";
    case "as_built_iff":
      return "Z1";
    case "post_award_information":
      return "P1";
    case "void_or_cancelled":
      return "XX";
    default:
      return "";
  }
};

const incrementRevisionCode = (purpose: string, currentCode?: string): string => {
  const normalizedPurpose = normalizePurpose(purpose);
  const code = String(currentCode || "").trim();
  if (!code) return "";
  if (normalizedPurpose === "inter_discipline_check") {
    if (code === "A0") return "R0";
    const match = /^R(\d+)$/.exec(code);
    return match ? `R${Number(match[1]) + 1}` : "R0";
  }
  const numericOnly = /^(\d+)$/.exec(code);
  if (numericOnly) {
    const width = numericOnly[1].length;
    return String(Number(numericOnly[1]) + 1).padStart(width, "0");
  }
  const prefixed = /^([A-Z]+)(\d+)$/.exec(code);
  if (prefixed) {
    return `${prefixed[1]}${Number(prefixed[2]) + 1}`;
  }
  return code;
};

const buildRevisionChangeNote = (params: {
  purpose: string;
  code: string;
  phase: string;
  projectId?: string;
  projectCode?: string;
  projectName?: string;
  action: string;
  status: string;
  vdsNumber: string;
}): string => {
  const optionShort = optionShortByPurpose[params.purpose] || "";
  const projectRef = params.projectId || params.projectCode || "NO_PROJECT";
  const trackingCode =
    params.code && optionShort
      ? `${projectRef}-${params.vdsNumber}-${optionShort}-${params.code}`
      : "";
  return `[REVISION_CODE] purpose=${params.purpose}; code=${params.code}; version=${params.phase}; project_id=${params.projectId || ""}; project_code=${params.projectCode || ""}; project_name=${params.projectName || ""}; tracking_code=${trackingCode}; option_short=${optionShort}; phase=${params.phase}; action=${params.action}; status=${params.status}; source=approval_page`;
};

const formatDateTime = (iso?: string): string => {
  if (!iso) return "Just now";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Just now";
  return d.toLocaleString();
};

const normalizeValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str || str === "-") return null;
  return str;
};

const cleanChangeText = (changes: string): string => {
  const meta = parseRevisionMeta(changes);
  if (!meta) return changes || "";
  const normalizedPurpose = normalizePurpose(meta.purpose);
  const purposeLabel = purposeLabels[normalizedPurpose] || normalizedPurpose;
  return `Revision updated: ${meta.code} (${purposeLabel})`;
};

const isPendingStatus = (status: string): boolean =>
  ["pending", "pending_review", "pending_approval"].includes(
    String(status || "").toLowerCase()
  );

const buildReviewSections = (data: Record<string, unknown>): ReviewSection[] => {
  const consumed = new Set<string>();
  const sections: ReviewSection[] = [];

  for (const section of sectionKeys) {
    const fields: ReviewField[] = [];
    for (const key of section.keys) {
      const normalized = normalizeValue(data[key]);
      if (!normalized) continue;
      consumed.add(key);
      fields.push({
        key,
        label: fieldDisplayNames[key] || key.replace(/_/g, " "),
        value: normalized,
      });
    }
    if (fields.length > 0) sections.push({ id: section.id, title: section.title, fields });
  }

  const otherFields = Object.entries(data)
    .filter(([key, value]) => !consumed.has(key) && normalizeValue(value))
    .map(([key, value]) => ({
      key,
      label: fieldDisplayNames[key] || key.replace(/_/g, " "),
      value: String(value),
    }));

  if (otherFields.length > 0) {
    sections.push({ id: "other", title: "Other", fields: otherFields });
  }

  return sections;
};

const statusBadgeLabel = (status: ApprovalStatus): string => {
  if (status === "pending_review") return "Pending Review";
  if (status === "pending_approval") return "Pending Approval";
  if (status === "reviewed") return "Reviewed";
  if (status === "approved") return "Approved";
  if (status === "void") return "Void";
  return "Pending";
};

const phaseLabel = (phase?: string): string => {
  if (phase === "pre_contract") return "Pre Contract";
  if (phase === "post_contract") return "Post Contract";
  return "Unknown Phase";
};

const mapRevisionLogs = (logs: VDSRevisionLogEntry[]): ApprovalRevisionLogEntry[] =>
  logs.map((log) => {
    const projectKey = projectKeyFromLog(log);
    const phase = String(log.phase || "").trim().toLowerCase() || inferPhaseFromPurpose(log.option_name);
    return {
      id: log.id,
      projectKey,
      scopeKey: scopeKeyFromProjectAndPhase(projectKey, phase),
      vdsNumber: log.vds_number,
      projectName: log.project_name || "-",
      projectCode: log.project_code || "-",
      phase,
      optionName: normalizePurpose(log.option_name),
      revisionCode: log.revision_code,
      trackingCode: log.tracking_code,
      action: log.action,
      status: log.status,
      createdAt: log.created_at,
      createdBy: log.created_by || "System",
    };
  });

const mapRecordToApprovalItems = (
  record: ValvesheetRecord,
  revisionLogs: ApprovalRevisionLogEntry[]
): ApprovalItem[] => {
  const recordLogs = revisionLogs.filter((log) => log.vdsNumber === record.vds_number);
  const logScopeKeys = Array.from(new Set(recordLogs.map((log) => log.scopeKey)));
  const versionEntriesWithMeta = (record.versions || []).map((entry) => ({
    entry,
    meta: parseRevisionMeta(entry.changes || ""),
  }));

  const groups = new Map<string, typeof versionEntriesWithMeta>();
  versionEntriesWithMeta.forEach((item) => {
    const projectKey = projectKeyFromMeta(item.meta || {
      project_name: record.project_name || undefined,
      project_code: record.project_code || undefined,
    });
    const phase = item.meta?.version || inferPhaseFromPurpose(item.meta?.purpose || "");
    const key = scopeKeyFromProjectAndPhase(projectKey, phase);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(item);
  });

  if (groups.size === 0) {
    return [{
      id: `${record.vds_number}::project:unknown`,
      tag: record.vds_number,
      vdsNumber: record.vds_number,
      projectName: record.project_name || "-",
      projectCode: record.project_code || "-",
      projectKey: "project:unknown",
      scopeKey: "project:unknown::unknown",
      phase: undefined,
      status: (record.status || "pending") as ApprovalStatus,
      pipingClass: record.piping_class || "-",
      valveType: String(record.generated_data_json?.valve_type || "Generated datasheet"),
      submittedAtIso: record.updated_at || record.created_at,
      submittedAtLabel: formatDateTime(record.updated_at || record.created_at),
      submittedBy: record.versions?.[record.versions.length - 1]?.author || "Datasheet Generator",
      optionCodes: [],
      requiresRevision: Boolean(record.requires_revision),
      reviewerComment: record.reviewer_comment || "",
    }];
  }

  const scopeKeysToRender =
    logScopeKeys.length > 0 ? logScopeKeys : Array.from(groups.keys());

  return scopeKeysToRender.map((scopeKey) => {
    const scopedEntries = groups.get(scopeKey) || [];
    const scopedLogs = revisionLogs
      .filter((log) => log.vdsNumber === record.vds_number && log.scopeKey === scopeKey)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const latestWithMeta = [...scopedEntries]
      .reverse()
      .find((item) => Boolean(item.meta));
    const latestMeta = latestWithMeta?.meta;
    const latestEntry = [...scopedEntries]
      .sort((a, b) => a.entry.version - b.entry.version)
      .at(-1)?.entry;

    const optionMap = new Map<string, { code: string; status: ApprovalStatus }>();
    if (scopedLogs.length > 0) {
      scopedLogs.forEach((log) => {
        optionMap.set(log.optionName, {
          code: log.revisionCode,
          status: (log.status || "pending") as ApprovalStatus,
        });
      });
    } else {
      [...scopedEntries]
        .sort((a, b) => a.entry.version - b.entry.version)
        .forEach((item) => {
          if (!item.meta) return;
          const optionKey = normalizePurpose(item.meta.purpose);
          optionMap.set(optionKey, {
            code: item.meta.code,
            status: (item.entry.status || "pending") as ApprovalStatus,
          });
        });
    }

    const optionCodes = Array.from(optionMap.values())
      .map((opt) => opt.code)
      .filter(Boolean);

    const latestLog = scopedLogs.at(-1);
    const projectKey = latestLog?.projectKey || latestMeta
      ? projectKeyFromMeta(latestMeta || {
          project_name: record.project_name || undefined,
          project_code: record.project_code || undefined,
        })
      : "project:unknown";
    const phase = latestLog?.phase || latestMeta?.version || inferPhaseFromPurpose(latestLog?.optionName || latestMeta?.purpose || "");

    return {
      id: `${record.vds_number}::${scopeKey}`,
      tag: record.vds_number,
      vdsNumber: record.vds_number,
      projectName: latestLog?.projectName || latestMeta?.project_name || record.project_name || "-",
      projectCode: latestLog?.projectCode || latestMeta?.project_code || record.project_code || "-",
      projectKey,
      scopeKey,
      phase,
      status: ((latestEntry?.status || record.status || "pending") as ApprovalStatus),
      pipingClass: record.piping_class || "-",
      valveType: String(record.generated_data_json?.valve_type || "Generated datasheet"),
      submittedAtIso: latestEntry?.date || record.updated_at || record.created_at,
      submittedAtLabel: formatDateTime(latestEntry?.date || record.updated_at || record.created_at),
      submittedBy: latestEntry?.author || "Datasheet Generator",
      latestRevisionCode: latestLog?.revisionCode || latestMeta?.code,
      latestRevisionPurpose: latestLog?.optionName || latestMeta?.purpose,
      optionCodes,
      nextPurposeValue: getNextWorkflowPurpose(
        latestLog?.optionName || latestMeta?.purpose,
        latestEntry?.status || record.status
      ),
      nextPurposeLabel:
        purposeLabels[
          getNextWorkflowPurpose(
            latestLog?.optionName || latestMeta?.purpose,
            latestEntry?.status || record.status
          )
        ] || "",
      requiresRevision: Boolean(record.requires_revision),
      reviewerComment: record.reviewer_comment || "",
    };
  });
};

export default function ApprovalPage() {
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalItem[]>([]);
  const [recordsByVds, setRecordsByVds] = useState<Record<string, ValvesheetRecord>>({});
  const [revisionLogs, setRevisionLogs] = useState<ApprovalRevisionLogEntry[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // --- Role-based signature track (sign / reject with comment) ---
  // Each vds_revision_log row collects up to 4 signatures. Roles enforced
  // server-side: MAKER -> PREPARED, CHECKER -> CHECKED/REVIEWED,
  // APPROVER -> APPROVED.
  const [signaturesByLog, setSignaturesByLog] = useState<
    Record<string, VDSSignature[]>
  >({});
  const [signDialogLogId, setSignDialogLogId] = useState<string | null>(null);
  const [signSelectedType, setSignSelectedType] = useState<VDSSignatureType>(
    "PREPARED",
  );
  const [signDecision, setSignDecision] = useState<VDSDecision>("APPROVED");
  const [signComment, setSignComment] = useState("");
  const [signBusy, setSignBusy] = useState(false);
  const [isLoadingReviewData, setIsLoadingReviewData] = useState(false);
  const [reviewSections, setReviewSections] = useState<ReviewSection[]>([]);
  const [reviewSummary, setReviewSummary] = useState<{ valveType: string; pipingClass: string }>({
    valveType: "-",
    pipingClass: "-",
  });
  const [reviewNote, setReviewNote] = useState("");
  const [selectedProjectFilter, setSelectedProjectFilter] = useState("all");
  const location = useLocation();
  const { toast } = useToast();
  const { user, userRole } = useAuth();
  const roleCode = getRoleCode(userRole, user);
  const canReview = canReviewApprovals(roleCode);
  const canOpenReview = canReview || isCreatorRole(roleCode);

  // Map our app's role_code to the signature types it can apply.
  const myRoleSigs: VDSSignatureType[] = useMemo(() => {
    const r = (roleCode || "").toUpperCase();
    if (r === "MAKER") return ["PREPARED"];
    if (r === "CHECKER") return ["CHECKED", "REVIEWED"];
    if (r === "APPROVER") return ["APPROVED"];
    return [];
  }, [roleCode]);

  // Helper: which signatures are still unused on a given log row?
  const remainingSigsForRow = (logId: string): VDSSignatureType[] => {
    const present = new Set(
      (signaturesByLog[logId] || [])
        .filter((s) => !s.revoked)
        .map((s) => s.signature_type),
    );
    return myRoleSigs.filter((t) => !present.has(t));
  };

  // Refresh the signatures for one row
  const reloadSigsForRow = async (logId: string) => {
    try {
      const sigs = await api.listVdsRevisionSignatures(logId);
      setSignaturesByLog((m) => ({ ...m, [logId]: sigs }));
    } catch {
      // ignore — endpoint may not be deployed yet, page still works
    }
  };

  const openSignDialog = (logId: string) => {
    setSignDialogLogId(logId);
    const remaining = remainingSigsForRow(logId);
    setSignSelectedType(remaining[0] || myRoleSigs[0] || "PREPARED");
    setSignDecision("APPROVED");
    setSignComment("");
  };

  const closeSignDialog = () => {
    setSignDialogLogId(null);
    setSignComment("");
  };

  const handleSubmitSignature = async () => {
    if (!signDialogLogId) return;
    if (signDecision === "REJECTED" && !signComment.trim()) {
      toast({
        title: "Comment required",
        description: "Rejecting a revision requires a reason in the comment.",
        variant: "destructive",
      });
      return;
    }
    setSignBusy(true);
    try {
      await api.signVdsRevisionLog(signDialogLogId, {
        signature_type: signSelectedType,
        decision: signDecision,
        comment:
          signDecision === "REJECTED" ? signComment.trim() : undefined,
      });
      toast({
        title:
          signDecision === "REJECTED"
            ? "Revision rejected"
            : `Signed as ${signSelectedType}`,
        description:
          signDecision === "REJECTED"
            ? "The Maker can address the comment in the next revision."
            : `Your ${signSelectedType} signature has been recorded.`,
      });
      await reloadSigsForRow(signDialogLogId);
      await loadApprovals();
      closeSignDialog();
    } catch (e) {
      toast({
        title: "Signature failed",
        description:
          e instanceof Error ? e.message : "Could not record signature.",
        variant: "destructive",
      });
    } finally {
      setSignBusy(false);
    }
  };

  const loadApprovals = async () => {
    try {
      let [res, revisionLogRes] = await Promise.all([
        api.listValvesheets({ limit: 500 }),
        api.listVdsRevisionLogs({ limit: 2000 }),
      ]);

      // Bootstrap: for any valvesheet that has no revision-log row yet,
      // create the initial IDC row so it surfaces on the Approval page.
      // The bootstrap endpoint is idempotent — safe to call repeatedly.
      const vdsWithLogs = new Set(
        revisionLogRes.records.map((r) => r.vds_number),
      );
      const vdsNeedingBootstrap = res.records
        .filter((v) => !vdsWithLogs.has(v.vds_number))
        .map((v) => v.vds_number);
      if (vdsNeedingBootstrap.length > 0) {
        await Promise.allSettled(
          vdsNeedingBootstrap.map((vds) => api.bootstrapVdsRevisionLog(vds)),
        );
        revisionLogRes = await api.listVdsRevisionLogs({ limit: 2000 });
      }

      const mappedLogs = mapRevisionLogs(revisionLogRes.records);
      const approvals = res.records
        .flatMap((record) => mapRecordToApprovalItems(record, mappedLogs))
        .filter(
          (item) => isPendingStatus(item.status) || Boolean(item.nextPurposeValue)
        )
        .sort((a, b) => new Date(b.submittedAtIso).getTime() - new Date(a.submittedAtIso).getTime());

      setPendingApprovals(approvals);
      setRevisionLogs(mappedLogs);
      const mapped: Record<string, ValvesheetRecord> = {};
      res.records.forEach((r) => {
        mapped[r.vds_number] = r;
      });
      setRecordsByVds(mapped);
    } catch {
      setPendingApprovals([]);
      setRecordsByVds({});
      setRevisionLogs([]);
    }
  };

  useEffect(() => {
    void loadApprovals();
  }, []);

  const allowedPendingApprovals = useMemo(() => {
    return pendingApprovals.filter((item) => ALLOWED_PROJECT_CODES.has(normalizedProjectCode(item)));
  }, [pendingApprovals]);

  const projectOptions = useMemo(() => {
    const entries = new Map<string, string>();
    allowedPendingApprovals.forEach((item) => {
      const filterValue = projectFilterValue(item);
      if (entries.has(filterValue)) return;
      const label =
        item.projectName !== "-" && item.projectCode !== "-"
          ? `${item.projectName} (${item.projectCode})`
          : item.projectName !== "-"
            ? item.projectName
            : item.projectCode !== "-"
              ? item.projectCode
              : "Unknown Project";
      entries.set(filterValue, label);
    });
    return Array.from(entries.entries()).map(([value, label]) => ({ value, label }));
  }, [allowedPendingApprovals]);

  const filteredPendingApprovals = useMemo(() => {
    const scoped = allowedPendingApprovals;
    if (selectedProjectFilter === "all") return scoped;
    return scoped.filter((item) => projectFilterValue(item) === selectedProjectFilter);
  }, [allowedPendingApprovals, selectedProjectFilter]);

  // Bulk-load the signature track for each visible approval so the row
  // badges + "remaining slots for my role" logic have data to render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = filteredPendingApprovals.map((a) => a.id);
      if (ids.length === 0) return;
      const results = await Promise.allSettled(
        ids.map((id) => api.listVdsRevisionSignatures(id)),
      );
      if (cancelled) return;
      const next: Record<string, VDSSignature[]> = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") next[ids[i]] = r.value;
      });
      setSignaturesByLog((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [filteredPendingApprovals]);

  useEffect(() => {
    const routeState = (location.state as { vdsNumber?: string; approvalId?: string } | null) || null;
    const approvalIdFromRoute = routeState?.approvalId;
    const vdsFromRoute = routeState?.vdsNumber;
    if (approvalIdFromRoute) {
      const matched = filteredPendingApprovals.find((item) => item.id === approvalIdFromRoute);
      if (matched) {
        setSelectedTag(matched.id);
        return;
      }
    }
    if (vdsFromRoute) {
      const matched = filteredPendingApprovals.find((item) => item.vdsNumber === vdsFromRoute);
      if (matched) {
        setSelectedTag(matched.id);
        return;
      }
    }
    if (selectedTag && !filteredPendingApprovals.some((item) => item.id === selectedTag)) {
      setSelectedTag(filteredPendingApprovals[0]?.id || "");
      return;
    }
    if (!selectedTag && filteredPendingApprovals.length > 0) {
      setSelectedTag(filteredPendingApprovals[0].id);
    }
  }, [location.state, filteredPendingApprovals, selectedTag]);

  const selectedApproval = useMemo(
    () => filteredPendingApprovals.find((item) => item.id === selectedTag),
    [filteredPendingApprovals, selectedTag]
  );

  const creatorRequestLabel = useMemo(() => {
    if (!selectedApproval) return "Request";
    return selectedApproval.status === "pending_review"
      ? "Request to Review"
      : "Request to Approve";
  }, [selectedApproval]);

  const selectedRecord = selectedApproval
    ? recordsByVds[selectedApproval.vdsNumber]
    : undefined;

  const versions = useMemo(() => {
    if (!selectedRecord?.versions) return [];
    const scopedLogs = revisionLogs
      .filter((log) => {
        if (!selectedApproval) return false;
        return log.vdsNumber === selectedApproval.vdsNumber && log.scopeKey === selectedApproval.scopeKey;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (scopedLogs.length > 0) {
      return scopedLogs.map((log, idx) => ({
        id: `${selectedTag}-log-${log.id}`,
        version: scopedLogs.length - idx,
        status: (log.status || "pending") as ApprovalStatus,
        author: log.createdBy || "System",
        date: log.createdAt,
        changes: `Revision updated: ${log.revisionCode} (${purposeLabels[log.optionName] || log.optionName})`,
        revisionCode: log.revisionCode,
        reviewNote: undefined,
      }));
    }

    const all = [...selectedRecord.versions]
      .map((entry) => ({
        entry,
        meta: parseRevisionMeta(entry.changes || ""),
      }))
      .filter((item) => {
        if (!selectedApproval) return true;
        if (!item.meta) return false;
        return scopeKeyFromProjectAndPhase(
          projectKeyFromMeta(item.meta),
          item.meta.version || inferPhaseFromPurpose(item.meta.purpose || "")
        ) === selectedApproval.scopeKey;
      });

    const source = all.length > 0
      ? all
      : [...selectedRecord.versions].map((entry) => ({
          entry,
          meta: parseRevisionMeta(entry.changes || ""),
        }));

    return source
      .map((item) => ({
        id: `${selectedTag}-v${item.entry.version}`,
        version: item.entry.version,
        status: (item.entry.status || "pending") as ApprovalStatus,
        author: item.entry.author || "System",
        date: item.entry.date,
        changes: cleanChangeText(item.entry.changes || ""),
        revisionCode: item.meta?.code,
        reviewNote: item.entry.review_note || undefined,
      }))
      .sort((a, b) => b.version - a.version);
  }, [selectedRecord, selectedTag, selectedApproval, revisionLogs]);

  const isReviewMilestone = useMemo(() => {
    const purpose = normalizePurpose(selectedApproval?.latestRevisionPurpose || "");
    return reviewStepPurposes.has(purpose);
  }, [selectedApproval?.latestRevisionPurpose]);

  const handleReview = async (item: ApprovalItem) => {
    setSelectedTag(item.id);
    setIsReviewModalOpen(true);
    setIsLoadingReviewData(true);
    setReviewNote("");
    setReviewSections([]);
    setReviewSummary({
      valveType: item.valveType || "-",
      pipingClass: item.pipingClass || "-",
    });
    try {
      const latestRecord = await api.getValvesheet(item.vdsNumber);
      setRecordsByVds((prev) => ({ ...prev, [latestRecord.vds_number]: latestRecord }));
      const base =
        (latestRecord.generated_data_json as Record<string, unknown> | undefined) ||
        (await api.getMLPrediction(item.vdsNumber)).data ||
        {};
      const data = await api.mergeMaterialsFromAgent(
        item.vdsNumber,
        { ...base },
        REVIEW_MATERIAL_MERGE_KEYS,
      );
      setReviewSections(buildReviewSections(data));
      setReviewSummary({
        valveType: normalizeValue(data.valve_type) || item.valveType || "-",
        pipingClass: normalizeValue(data.piping_class) || item.pipingClass || "-",
      });
    } catch {
      toast({
        title: "Review Data Unavailable",
        description: `Could not load datasheet fields for ${item.vdsNumber}`,
        variant: "destructive",
      });
    } finally {
      setIsLoadingReviewData(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedApproval) return;
    const nextStatus: ApprovalStatus = isReviewMilestone ? "reviewed" : "approved";
    const normalizedPurpose = normalizePurpose(selectedApproval.latestRevisionPurpose || "");
    const projectId =
      selectedApproval.projectKey.startsWith("id:")
        ? selectedApproval.projectKey.slice(3)
        : "";
    const projectCode =
      selectedApproval.projectCode !== "-" ? selectedApproval.projectCode : "";
    const projectName =
      selectedApproval.projectName !== "-" ? selectedApproval.projectName : "";
    const phase = inferPhaseFromPurpose(normalizedPurpose);
    const changeNote =
      normalizedPurpose && selectedApproval.latestRevisionCode
        ? buildRevisionChangeNote({
            purpose: normalizedPurpose,
            code: selectedApproval.latestRevisionCode,
            phase,
            projectId,
            projectCode,
            projectName,
            action: nextStatus,
            status: nextStatus,
            vdsNumber: selectedApproval.vdsNumber,
          })
        : (nextStatus === "reviewed" ? "Reviewed" : "Approved for issue");
    try {
      await api.updateValvesheetStatus(selectedApproval.vdsNumber, {
        status: nextStatus,
        requires_revision: false,
        reviewer_comment: "",
        author: user?.name || "Reviewer",
        change_note: changeNote,
      });
      await loadApprovals();
    } catch {
      toast({
        title: "Update failed",
        description: "Could not update datasheet status right now.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: nextStatus === "reviewed" ? "Datasheet Reviewed" : "Datasheet Approved",
      description: `${selectedApproval.vdsNumber} has been marked as ${nextStatus}.`,
    });
    setReviewNote("");
    setIsReviewModalOpen(false);
  };

  const handleStartNextMilestone = async (item: ApprovalItem) => {
    if (!canReview) {
      toast({
        title: "Restricted",
        description: "Only reviewer or approver roles can start the next milestone.",
        variant: "destructive",
      });
      return;
    }
    const nextPurpose = normalizePurpose(item.nextPurposeValue || "");
    if (!nextPurpose) return;

    const record = recordsByVds[item.vdsNumber];
    const projectId = item.projectKey.startsWith("id:")
      ? item.projectKey.slice(3)
      : "";
    const projectCode = item.projectCode !== "-" ? item.projectCode : "";
    const projectName = item.projectName !== "-" ? item.projectName : "";
    const phase = inferPhaseFromPurpose(nextPurpose);
    const revisionCode = getInitialRevisionCode(nextPurpose);
    const status: ApprovalStatus = reviewStepPurposes.has(nextPurpose)
      ? "pending_review"
      : "pending_approval";

    if (!record || !phase || !revisionCode) {
      toast({
        title: "Unable to start next milestone",
        description: "Current VDS data is incomplete for workflow progression.",
        variant: "destructive",
      });
      return;
    }

    try {
      await api.upsertValvesheet({
        vds_number: item.vdsNumber,
        piping_class: record.piping_class,
        status,
        requires_revision: false,
        reviewer_comment: "",
        generated_data_json: record.generated_data_json || undefined,
        project_name: projectName || undefined,
        project_code: projectCode || undefined,
        author: user?.name || "Reviewer",
        change_note: buildRevisionChangeNote({
          purpose: nextPurpose,
          code: revisionCode,
          phase,
          projectId,
          projectCode,
          projectName,
          action: "submitted",
          status,
          vdsNumber: item.vdsNumber,
        }),
      });
      await loadApprovals();
      toast({
        title: "Next milestone started",
        description: `${item.vdsNumber} moved to ${purposeLabels[nextPurpose] || nextPurpose} (${revisionCode}).`,
      });
    } catch {
      toast({
        title: "Start failed",
        description: "Could not create the next workflow milestone.",
        variant: "destructive",
      });
    }
  };

  const handleCreatorRequest = async () => {
    if (!selectedApproval || !selectedRecord) return;

    const normalizedPurpose = normalizePurpose(selectedApproval.latestRevisionPurpose || "");
    const projectId = selectedApproval.projectKey.startsWith("id:")
      ? selectedApproval.projectKey.slice(3)
      : "";
    const projectCode =
      selectedApproval.projectCode !== "-" ? selectedApproval.projectCode : "";
    const projectName =
      selectedApproval.projectName !== "-" ? selectedApproval.projectName : "";
    const phase = inferPhaseFromPurpose(normalizedPurpose);
    const revisionCode = selectedApproval.latestRevisionCode
      ? incrementRevisionCode(normalizedPurpose, selectedApproval.latestRevisionCode)
      : getInitialRevisionCode(normalizedPurpose);
    const status: ApprovalStatus = selectedApproval.status === "pending_review"
      ? "pending_review"
      : "pending_approval";

    const changeNote =
      normalizedPurpose && revisionCode
        ? buildRevisionChangeNote({
            purpose: normalizedPurpose,
            code: revisionCode,
            phase,
            projectId,
            projectCode,
            projectName,
            action: "submitted",
            status,
            vdsNumber: selectedApproval.vdsNumber,
          })
        : creatorRequestLabel;

    try {
      await api.upsertValvesheet({
        vds_number: selectedApproval.vdsNumber,
        piping_class: selectedRecord.piping_class,
        status,
        requires_revision: false,
        reviewer_comment: "",
        generated_data_json: selectedRecord.generated_data_json || undefined,
        project_name: projectName || undefined,
        project_code: projectCode || undefined,
        author: user?.name || user?.email || "Creator",
        change_note: changeNote,
      });
      await loadApprovals();
    } catch {
      toast({
        title: "Request failed",
        description: `Could not submit ${selectedApproval.vdsNumber} for the latest approval step.`,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: creatorRequestLabel,
      description: `${selectedApproval.vdsNumber} was submitted with revision ${revisionCode || "current"} for ${status === "pending_review" ? "review" : "approval"}.`,
    });
    setReviewNote("");
    setIsReviewModalOpen(false);
    setSelectedTag(selectedApproval.id);
  };

  const handleReturn = async () => {
    if (!selectedApproval) return;
    const comment = reviewNote.trim() || "Please revise and resubmit.";
    const pendingStatus: ApprovalStatus = isReviewMilestone ? "pending_review" : "pending_approval";
    const normalizedPurpose = normalizePurpose(selectedApproval.latestRevisionPurpose || "");
    const nextRevisionCode = incrementRevisionCode(
      normalizedPurpose,
      selectedApproval.latestRevisionCode
    );
    const projectId =
      selectedApproval.projectKey.startsWith("id:")
        ? selectedApproval.projectKey.slice(3)
        : "";
    const projectCode =
      selectedApproval.projectCode !== "-" ? selectedApproval.projectCode : "";
    const projectName =
      selectedApproval.projectName !== "-" ? selectedApproval.projectName : "";
    const phase = inferPhaseFromPurpose(normalizedPurpose);
    const changeNote =
      normalizedPurpose && nextRevisionCode
        ? buildRevisionChangeNote({
            purpose: normalizedPurpose,
            code: nextRevisionCode,
            phase,
            projectId,
            projectCode,
            projectName,
            action: "returned",
            status: pendingStatus,
            vdsNumber: selectedApproval.vdsNumber,
          })
        : "Returned for revision";
    try {
      await api.updateValvesheetStatus(selectedApproval.vdsNumber, {
        status: pendingStatus,
        requires_revision: true,
        reviewer_comment: comment,
        author: user?.name || "Reviewer",
        change_note: changeNote,
      });
      await loadApprovals();
    } catch {
      toast({
        title: "Update failed",
        description: "Could not return datasheet for revision.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Datasheet Returned",
      description: `${selectedApproval.vdsNumber} has been returned for revision`,
      variant: "destructive",
    });
    setReviewNote("");
    setIsReviewModalOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader
        title="Approval & Version Control"
        breadcrumbs={[
          { label: "FPSO Prosperity", href: "/" },
          { label: "Approval & Versions" },
        ]}
      />

      {/* Legacy review modal removed. The four-signature sign / reject
          flow below is now the only way to advance or push back a
          revision. */}

      {/* ============================================================
          Role-based Sign / Reject dialog. Enforces:
            - One signature per slot per row
            - Same user can't sign more than one slot per row
            - Role-to-signature mapping (Maker / Checker / Approver)
            - REJECT requires a comment; flips status to "rejected"
          ============================================================ */}
      <Dialog
        open={signDialogLogId !== null}
        onOpenChange={(open) => {
          if (!open) closeSignDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign / Reject Revision</DialogTitle>
            <DialogDescription>
              You will sign as the currently logged-in user (role:{" "}
              <span className="font-mono">{roleCode || "—"}</span>). Backend
              enforces role-to-slot mapping and separation of duties.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {myRoleSigs.length === 0 ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                Your role <span className="font-mono">{roleCode || "(none)"}</span>{" "}
                isn't one of MAKER / CHECKER / APPROVER. You can browse but
                not sign. Ask an admin to assign you a role.
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Signature slot</Label>
                  <Select
                    value={signSelectedType}
                    onValueChange={(v) => setSignSelectedType(v as VDSSignatureType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(signDialogLogId
                        ? remainingSigsForRow(signDialogLogId)
                        : myRoleSigs
                      ).map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Decision</Label>
                  <RadioGroup
                    value={signDecision}
                    onValueChange={(v) => setSignDecision(v as VDSDecision)}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="APPROVED" id="approve" />
                      <Label htmlFor="approve" className="cursor-pointer">
                        Approve and sign
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="REJECTED" id="reject" />
                      <Label htmlFor="reject" className="cursor-pointer">
                        Reject — send back to Maker with comment
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                {signDecision === "REJECTED" && (
                  <div className="space-y-1.5">
                    <Label>
                      Comment <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      value={signComment}
                      onChange={(e) => setSignComment(e.target.value)}
                      placeholder="What needs to be fixed before this can be signed?"
                      rows={4}
                    />
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeSignDialog} disabled={signBusy}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitSignature}
              disabled={
                signBusy ||
                myRoleSigs.length === 0 ||
                !signSelectedType ||
                (signDecision === "REJECTED" && !signComment.trim())
              }
              variant={signDecision === "REJECTED" ? "destructive" : "default"}
            >
              {signBusy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Working...
                </>
              ) : signDecision === "REJECTED" ? (
                "Reject with comment"
              ) : (
                `Sign as ${signSelectedType}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Panel title="Pending Approvals" description="Generated valvesheets awaiting review">
                <div className="mb-4 flex justify-end">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="text-sm font-medium text-muted-foreground">
                      Projects
                    </label>
                    <select
                      className="h-10 min-w-[280px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                      value={selectedProjectFilter}
                      onChange={(e) => setSelectedProjectFilter(e.target.value)}
                    >
                      <option value="all">All Projects</option>
                      {projectOptions.map((project) => (
                        <option key={project.value} value={project.value}>
                          {project.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {filteredPendingApprovals.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8">
                    No valvesheets are currently active in approval workflow.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredPendingApprovals.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                          selectedTag === item.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/30"
                        }`}
                        onClick={() => setSelectedTag(item.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-mono text-sm font-medium">{item.vdsNumber}</span>
                            <Badge variant="outline">{statusBadgeLabel(item.status)}</Badge>
                            {(item.optionCodes.length > 0
                              ? item.optionCodes
                              : item.latestRevisionCode
                                ? [item.latestRevisionCode]
                                : []
                            ).map((code) => (
                              <Badge key={`${item.id}-code-${code}`} variant="outline" className="font-mono">
                                Rev {code}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {item.valveType} • {item.pipingClass}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Project: {item.projectName !== "-" && item.projectCode !== "-"
                              ? `${item.projectName} (${item.projectCode})`
                              : item.projectName !== "-"
                                ? item.projectName
                                : item.projectCode !== "-"
                                  ? item.projectCode
                                  : "-"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Phase: {phaseLabel(item.phase)}
                          </p>
                          {item.nextPurposeLabel && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Next Milestone: {item.nextPurposeLabel}
                            </p>
                          )}
                          {item.requiresRevision && item.reviewerComment && (
                            <p className="text-xs mt-1 text-amber-700">
                              Revision Note: {item.reviewerComment}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="w-3 h-3" />
                              {item.submittedBy}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {item.submittedAtLabel}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {canReview && item.nextPurposeValue && !isPendingStatus(item.status) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleStartNextMilestone(item);
                              }}
                            >
                              Start Next
                              <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                          )}
                          {/* Current status badge — replaces the legacy Review button */}
                          <Badge variant="outline">{statusBadgeLabel(item.status)}</Badge>
                          {/* Signature track — role-based sign / reject */}
                          {(signaturesByLog[item.id] || []).map((s) => (
                            <Badge
                              key={s.id}
                              variant={
                                s.decision === "REJECTED" ? "destructive" : "default"
                              }
                              className="font-mono text-[10px]"
                              title={
                                s.comment
                                  ? `${s.signer_name_snapshot || "Signer"}: ${s.comment}`
                                  : `${s.signature_type} by ${s.signer_name_snapshot || "—"}`
                              }
                            >
                              {s.signature_type[0]}
                              {s.decision === "REJECTED" ? "✗" : "✓"}
                            </Badge>
                          ))}
                          {myRoleSigs.length > 0 &&
                            remainingSigsForRow(item.id).length > 0 &&
                            item.status !== "approved" &&
                            item.status !== "void" &&
                            item.status !== "rejected" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openSignDialog(item.id);
                                }}
                              >
                                Sign / Reject
                              </Button>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel title={selectedApproval ? `Version History - ${selectedApproval.vdsNumber}` : "Version History"}>
                {!selectedApproval ? (
                  <div className="text-sm text-muted-foreground">Select a valvesheet to view versions.</div>
                ) : versions.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No versions available.</div>
                ) : (
                  <div className="space-y-3">
                    {versions.map((version, idx) => (
                      <div
                        key={version.id}
                        className={`p-3 rounded-lg border ${
                          idx === 0 ? "border-primary bg-primary/5" : "border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">v{version.version}</span>
                            {version.revisionCode && (
                              <Badge variant="outline" className="font-mono">
                                Rev {version.revisionCode}
                              </Badge>
                            )}
                          </div>
                          {idx === 0 && <Badge className="bg-primary text-primary-foreground">Current</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{version.changes}</p>
                        {version.reviewNote && (
                          <p className="text-xs mt-1 text-foreground/90">Note: {version.reviewNote}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                          <User className="w-3 h-3" />
                          {version.author}
                          <span>•</span>
                          {formatDateTime(version.date)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

