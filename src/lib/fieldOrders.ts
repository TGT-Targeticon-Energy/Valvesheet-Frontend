/**
 * Canonical per-valve-type ordering for construction and material sub-fields.
 *
 * Mirrors the row order in the six xlsm A0 datasheet templates so the card
 * preview and the Excel download both render rows in the order the engineering
 * team expects.
 *
 * Used by:
 *  - src/lib/excelBuilder.ts (Excel section iteration)
 *  - src/components/agent/DatasheetCard.tsx (preview)
 *  - src/components/agent/SuggestionCard.tsx (preview)
 */

export type ValveTypeKey =
  | "ball"
  | "check"
  | "gate"
  | "dbb"
  | "needle"
  | "butterfly"
  | "globe"
  | "default";

export const CONSTRUCTION_ORDER_BY_TYPE: Record<ValveTypeKey, string[]> = {
  ball: ["body_construction", "ball_construction", "stem_construction", "seat_construction", "locks"],
  check: ["body_construction", "disc_construction", "seat_construction"],
  gate: [
    "body_construction", "wedge_construction", "stem_construction", "seat_construction",
    "back_seat_construction", "packing_construction", "locks",
  ],
  dbb: ["body_construction", "stem_construction", "ball_construction", "seat_construction"],
  needle: ["bonnet_construction", "stem_construction", "disc_construction"],
  butterfly: ["body_construction", "disc_construction", "stem_construction", "shaft_construction", "seat_construction"],
  globe: [
    "body_construction", "stem_construction", "disc_construction", "seat_construction",
    "back_seat_construction", "packing_construction",
  ],
  default: [
    "body_construction", "stem_construction", "ball_construction", "disc_construction",
    "wedge_construction", "shaft_construction", "seat_construction", "back_seat_construction",
    "packing_construction", "bonnet_construction", "construction_bonnet", "locks",
  ],
};

export const MATERIAL_ORDER_BY_TYPE: Record<ValveTypeKey, string[]> = {
  ball: [
    "body_material", "ball_material", "seat_material", "seal_material", "stem_material",
    "gland_material", "gland_packing", "lever_handwheel", "spring_material",
    "gaskets", "bolts", "nuts",
  ],
  check: [
    "body_material", "material_cover_material", "disc_material", "trim_material",
    "hinge_pin_material", "spring_material", "seat_material", "seal_material",
    "gaskets", "bolts", "nuts",
  ],
  gate: [
    "body_material", "wedge_material", "stem_material", "seat_material",
    "back_seat_material", "trim_material", "gland_material", "gland_packing",
    "lever_handwheel", "gaskets", "bolts", "nuts",
  ],
  dbb: [
    "body_material", "ball_material", "stem_material", "seat_material",
    "seal_material", "gland_material", "gland_packing",
    "gaskets", "bolts", "nuts",
  ],
  needle: [
    "body_material", "stem_material", "seat_material", "needle_material",
    "gland_material", "gland_packing", "gaskets", "bolts", "nuts",
  ],
  butterfly: [
    "body_material", "disc_material", "seat_material", "seal_material",
    "stem_material", "shaft_material", "gland_material", "gland_packing",
    "lever_handwheel", "gaskets", "bolts", "nuts",
  ],
  globe: [
    "body_material", "disc_material", "stem_material", "seat_material",
    "back_seat_material", "trim_material", "gland_material", "gland_packing",
    "gaskets", "bolts", "nuts",
  ],
  default: [
    "body_material", "flange_material", "ball_material", "disc_material", "wedge_material",
    "needle_material", "material_needle_material", "stem_material", "trim_material",
    "seat_material", "seal_material", "back_seat_material", "shaft_material",
    "gland_material", "gland_packing", "spring_material", "lever_handwheel",
    "gaskets", "bolts", "nuts", "hinge_pin_material",
    "material_cover_material", "material_hinge/_hinge_pin",
  ],
};

/** Detect the valve type key from a free-form `valve_type` string. */
export function detectValveTypeKey(rawType: string | undefined | null): ValveTypeKey {
  const lower = String(rawType || "").toLowerCase();
  if (!lower) return "default";
  if (lower.includes("dbb") || lower.includes("double")) return "dbb";
  if (lower.includes("ball")) return "ball";
  if (lower.includes("check")) return "check";
  if (lower.includes("gate")) return "gate";
  if (lower.includes("needle")) return "needle";
  if (lower.includes("butterfly")) return "butterfly";
  if (lower.includes("globe")) return "globe";
  return "default";
}

export function constructionOrderFor(rawType: string | undefined | null): string[] {
  return CONSTRUCTION_ORDER_BY_TYPE[detectValveTypeKey(rawType)];
}

export function materialOrderFor(rawType: string | undefined | null): string[] {
  return MATERIAL_ORDER_BY_TYPE[detectValveTypeKey(rawType)];
}
