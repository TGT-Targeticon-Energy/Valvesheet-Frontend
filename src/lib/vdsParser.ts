/**
 * VDS Code Builder & Label Utilities
 * Builds a VDS code from structured field selections.
 */

export interface VdsFields {
  valveType: string;   // BL | BF | GA | GL | CH | DB | NE
  seat: string;        // T | P | M
  spec: string;        // 2–4 alphanumeric e.g. A1, T50A
  endConnection: string; // R | RJ | FF | H | T
  bore?: string;       // R | F  (Ball Valve only)
  design?: string;     // Valve design char (all non-ball types)
}

export interface BuildResult {
  vdsCode: string;
  errors: string[];
}

export const VALVE_TYPE_OPTIONS = [
  { code: "BL", label: "Ball Valve" },
  { code: "BF", label: "Butterfly Valve" },
  { code: "GA", label: "Gate Valve" },
  { code: "GL", label: "Globe Valve" },
  { code: "CH", label: "Check Valve" },
  { code: "DB", label: "Double Block & Bleed" },
  { code: "NE", label: "Needle Valve" },
];

export const SEAT_OPTIONS = [
  { code: "T", label: "PTFE" },
  { code: "P", label: "PEEK" },
  { code: "M", label: "Metal" },
];

export const END_CONNECTION_OPTIONS = [
  { code: "R",  label: "Raised Face (RF)" },
  { code: "J",  label: "Ring Type Joint (RTJ)" },
  { code: "F",  label: "Flat Face (FF)" },
  { code: "JT", label: "RTJ + NPT Female (Instrument)" },
];

// ── Rule tables (mirror backend valve_type_rules.py / end_conn_rules.py) ─────

/** Valid seat codes per valve type — Section 4, CLAUDE.md */
export const VALID_SEATS_BY_TYPE: Record<string, string[]> = {
  GA: ["M"],
  GL: ["M"],
  CH: ["M"],
  DB: ["M"],
  NE: ["M"],
  BF: ["T", "M"],
  BL: ["T", "P", "M"],
  BS: ["T", "P", "M"],
};

const _NON_METALLIC_SPECS = new Set(["A30","A31","A40","A41","A42"]);

/** Derive valid end connection code(s) from spec — Section 6, CLAUDE.md */
export function endConnForSpec(spec: string): string[] {
  const s = spec.trim().toUpperCase();
  if (_NON_METALLIC_SPECS.has(s)) return ["F"];
  if (/^T\d/.test(s)) return ["JT"];          // T50A, T50B, T60A, T60B …
  const prefix = s[0] ?? "";
  if (["A","B","D"].includes(prefix)) return ["R"];  // 150 / 300 / 600# → RF
  if (["E","F","G"].includes(prefix)) return ["J"];  // 900 / 1500 / 2500# → RTJ
  return ["R"]; // safe fallback
}

export const BORE_OPTIONS = [
  { code: "R", label: "Reduced Bore" },
  { code: "F", label: "Full Bore" },
];

export const DESIGN_OPTIONS = [
  { code: "I", label: "Inline (Straight)" },
  { code: "A", label: "Angle" },
  { code: "Y", label: "Screw & Yoke" },
  { code: "W", label: "Wafer" },
  { code: "S", label: "Swing" },
  { code: "P", label: "Piston" },
  { code: "D", label: "Dual Plate" },
  { code: "T", label: "Triple Offset" },
];

/** Valid designs per valve type (from VDS code structure) */
export const DESIGNS_BY_TYPE: Record<string, string[]> = {
  BL: ["R", "F"],       // Bore: Reduced / Full
  BS: ["R", "F"],       // Bore: Reduced / Full
  BF: ["W", "T"],       // Wafer / Triple Offset
  GA: ["Y", "S"],       // Screw & Yoke / Swing
  GL: ["Y"],            // Screw & Yoke
  CH: ["P", "S", "D", "W"],  // Piston / Swing / Dual Plate / Wafer
  DB: ["P"],            // Piston
  NE: ["I", "A"],       // Inline / Angle
};

/** Default design when not specified */
export const DEFAULT_DESIGN: Record<string, string> = {
  BL: "R", BS: "R",     // Reduced Bore
  BF: "W",              // Wafer
  GA: "Y",              // Screw & Yoke
  GL: "Y",              // Screw & Yoke
  CH: "P",              // Piston
  DB: "P",              // Piston
  NE: "I",              // Inline
};

export function getLabel(options: { code: string; label: string }[], code: string): string {
  return options.find((o) => o.code === code)?.label ?? code;
}

// ── Valid piping spec codes — CLAUDE.md Section 5 (complete whitelist) ────────
export const VALID_SPEC_CODES = new Set([
  // CS non-NACE
  "A1","B1","D1","E1","F1","G1","A2",
  // CS NACE
  "A1N","B1N","D1N","E1N","F1N","G1N",
  "A2N","B2N","D2N","E2N","F2N","G2N",
  // LTCS NACE
  "A1LN","B1LN","D1LN","E1LN","F1LN","G1LN",
  "A2LN","B2LN","D2LN","E2LN","F2LN","G2LN",
  // CS Galvanized
  "A3","A4","B4","D4","A5","A6",
  // SS316L
  "A10","B10","D10","E10","F10","G10",
  "A10N","B10N","D10N","E10N","F10N","G10N",
  // DSS NACE
  "A20N","B20N","D20N","E20N","F20N","G20N",
  // SDSS
  "A25","G25",
  "A25N","B25N","D25N","E25N","F25N","G25N",
  // Non-metallic / special
  "A30","A31","A40","A41","A42",
  // Tubing
  "T50A","T50B","T50C","T60A","T60B","T60C",
]);

export function buildVdsCode(fields: VdsFields): BuildResult {
  const errors: string[] = [];

  if (!fields.valveType) errors.push("Valve type is required.");
  if (!fields.seat) errors.push("Seat material is required.");
  if (!fields.spec || !/^[A-Za-z0-9]{2,4}$/.test(fields.spec.trim()))
    errors.push("Piping spec must be 2–4 alphanumeric characters (e.g. A1, T50A).");
  else if (!VALID_SPEC_CODES.has(fields.spec.trim().toUpperCase()))
    errors.push(`Piping spec '${fields.spec.toUpperCase()}' is not a valid FPSO Albacora PMS code.`);

  if (errors.length > 0) return { vdsCode: "", errors };

  const spec = fields.spec.trim().toUpperCase();
  const vt = fields.valveType;
  let code = vt;

  // Bore/Design character — every valve type includes one per VDS code structure
  if (vt === "BL" || vt === "BS") {
    code += fields.bore ?? DEFAULT_DESIGN[vt] ?? "R";
  } else {
    code += fields.design ?? DEFAULT_DESIGN[vt] ?? "";
  }

  code += fields.seat;
  code += spec;
  code += fields.endConnection ?? "R"; // default: Raised Face

  return { vdsCode: code, errors: [] };
}

// ─── NLP Parser ───────────────────────────────────────────────────────────────

export interface BulkParseResult {
  valveTypes: string[];
  seats: string[];
  spec: string;
  specs?: string[];          // set when a keyword group (e.g. "tubing") is detected
  endConnections: string[];
  bores: string[];
  designs: string[];
  missingRequired: string[];
  warnings: string[];
}

const TUBING_SPECS = ["T50A","T50B","T50C","T60A","T60B","T60C"];

const KNOWN_TOKENS = new Set([
  "BL","BF","GA","GL","CH","DB","NE",
  "RF","RTJ","FF","NPT","PTFE","PEEK",
  "AND","THE","FOR","WITH","ALL","OR","IN","OF",
]);

const COMMON_SPECS = ["A1","A2","B1","D1","E1","F1","G1","A1N","B1N","D1N","A1LN","A10","A20N","A25","T50A"];

export function parsePlainEnglishBulk(raw: string): BulkParseResult {
  const text = raw.toLowerCase();
  const upper = raw.toUpperCase();

  const valveTypes: string[] = [];
  const seats: string[] = [];
  const endConnections: string[] = [];
  const bores: string[] = [];
  const designs: string[] = [];

  // ── Valve types ───────────────────────────────────────────
  // Every pattern is typo-tolerant: transpositions, doubled/dropped letters,
  // and common substitutions are all matched.
  if (/\ball\s+(valve(s)?|type(s)?)\b/.test(text)) {
    valveTypes.push(...VALVE_TYPE_OPTIONS.map((o) => o.code));
  } else {
    // BALL — "ball", "bal", "baal", "bll"
    if (/\bbal{1,2}l?\b/.test(text))                              valveTypes.push("BL");

    // BUTTERFLY — "butterfly", "buttewrfly", "butterflly", "butterfy", "buttefly"
    // Rule: starts with "butt" + has 'f' + has 'y' (the distinctive letters)
    if (/\bbutt[a-z]*f[a-z]*y[a-z]*\b/.test(text))               valveTypes.push("BF");

    // GATE — "gate", "gat", "gaet", "gatte" (must contain 't'; avoids "gas", "gave", etc.)
    if (/\bga[a-z]?t+[ae]?\b/.test(text))                        valveTypes.push("GA");

    // GLOBE — "globe", "globle", "globbe" (requires trailing 'e'; avoids "global")
    if (/\bglob[a-z]{0,2}e\b/.test(text))                        valveTypes.push("GL");

    // CHECK — "check", "chek", "cheeck", "chekc", "chck"
    if (/\bch[ae]?[ec]{1,2}[kc][a-z]?\b/.test(text))             valveTypes.push("CH");

    // DOUBLE BLOCK — "double block", "doubel block", "doubl blok", "dbb", "db bleed"
    if (/\bdoub[a-z]{1,3}\s+blo[a-z]{1,3}\b|\bdbb?\b/.test(text)) valveTypes.push("DB");

    // NEEDLE — "needle", "needal", "needel", "neddle", "neadle", "neetle"
    // ne + 0-2 optional chars + d/t + 1-4 chars + optional e
    if (/\bne[a-z]{0,2}[dt][a-z]{1,4}e?\b/.test(text))           valveTypes.push("NE");

    // also accept raw 2-letter codes typed directly: BL, BF, GA, GL, CH, DB, NE
    VALVE_TYPE_OPTIONS.forEach((o) => {
      if (!valveTypes.includes(o.code) && new RegExp(`\\b${o.code}\\b`).test(upper))
        valveTypes.push(o.code);
    });
  }

  // ── Seats ─────────────────────────────────────────────────
  if (/\ball\s+seats?\b/.test(text)) {
    seats.push(...SEAT_OPTIONS.map((o) => o.code));
  } else {
    if (/\b(ptfe|teflon)\b/.test(text)) seats.push("T");
    if (/\bpeek\b/.test(text))          seats.push("P");
    if (/\bmetal(lic)?\b/.test(text))   seats.push("M");
  }

  // ── End connections ───────────────────────────────────────
  // End connection is always rule-derived from spec — text detection here is
  // only a hint and is overridden later by endConnForSpec(). We still parse
  // explicit mentions so they can inform the fallback when spec is absent.
  if (/\braised\s*face\b|\brf\b/.test(text))               endConnections.push("R");
  if (/\brtj\b|\bring\s*(type\s*)?joint\b/.test(text))     endConnections.push("J");
  if (/\bflat\s*face\b|\bff\b/.test(text))                 endConnections.push("F");

  // ── Bore ──────────────────────────────────────────────────
  if (/\ball\s+bore(s)?\b/.test(text)) {
    bores.push(...BORE_OPTIONS.map((o) => o.code));
  } else {
    if (/\breduced(\s+bore)?\b/.test(text))                          bores.push("R");
    if (/\bfull(\s+bore)?\b/.test(text) && !/\bfull\s+face\b/.test(text)) bores.push("F");
  }

  // ── Design ────────────────────────────────────────────────
  if (/\ball\s+design(s)?\b/.test(text)) {
    designs.push(...DESIGN_OPTIONS.map((o) => o.code));
  } else {
    if (/\b(inline|straight)\b/.test(text)) designs.push("I");
    if (/\bangle\b/.test(text))             designs.push("A");
  }

  // ── Spec extraction ───────────────────────────────────────
  // A valid spec MUST have at least one digit (A1, T50A, B1N) OR be purely numeric (150, 300).
  // This prevents plain English words like "BALL", "SEAT", "GATE" from being picked up as specs.
  const isValidSpecToken = (tok: string) => /\d/.test(tok) || /^\d{2,4}$/.test(tok);

  let spec = "";
  // 1. Explicit "spec XXX" or "class XXX"
  const explicit = /\b(?:spec(?:ification)?|piping\s+class|class)\s+([A-Z0-9]{2,4})\b/i.exec(upper);
  if (explicit && isValidSpecToken(explicit[1])) {
    spec = explicit[1];
  } else {
    // 2. Standalone token: letter+digit pattern or pure number, not in known list
    const tokens = upper.match(/\b([A-Z][A-Z0-9]{1,3}|[0-9]{2,4})\b/g) ?? [];
    for (const tok of tokens) {
      if (isValidSpecToken(tok) && !KNOWN_TOKENS.has(tok) && !VALVE_TYPE_OPTIONS.some((o) => o.code === tok)) {
        spec = tok;
        break;
      }
    }
  }

  // ── Tubing group keyword ──────────────────────────────────
  // "tubing" (and common misspellings) → select all T50x / T60x specs
  let detectedSpecs: string[] | undefined;
  if (!spec && /\btubin[a-z]?\b/.test(text)) {
    detectedSpecs = TUBING_SPECS;
  }

  // ── Rule-based defaults ───────────────────────────────────
  // Seat: if not specified, use only the seats valid for the detected valve types.
  // End connection: fully determined by the spec prefix — never a free choice.
  let finalTypes = valveTypes.length > 0 ? valveTypes : VALVE_TYPE_OPTIONS.map((o) => o.code);

  // ── NE spec compatibility check ───────────────────────────
  // Must run before computing finalSeats/Bores/Designs so NE is removed first.
  const userAskedForNE = valveTypes.includes("NE");
  const neIncompatibleWithSpec = spec && (() => {
    const prefix = spec[0]?.toUpperCase() ?? "";
    const isTubing = /^T\d/i.test(spec);
    return !["E","F","G"].includes(prefix) && !isTubing;
  })();

  const missingRequired: string[] = [];
  if (!spec && !detectedSpecs) {
    missingRequired.push("piping spec (e.g. A1, T50A)");
  } else if (!detectedSpecs && !VALID_SPEC_CODES.has(spec.toUpperCase())) {
    // Parsed a token that looks like a spec but isn't in the FPSO Albacora PMS table
    missingRequired.push(
      `'${spec}' is not a valid piping spec. Valid codes include A1, B1, D1, E1, F1, G1, A1N, A1LN, A10, A20N, A25, T50A, etc.`
    );
  }

  const warnings: string[] = [];

  if (userAskedForNE && neIncompatibleWithSpec) {
    finalTypes = finalTypes.filter((vt) => vt !== "NE");

    if (finalTypes.length === 0) {
      // NE was the only type — hard error, nothing to generate
      missingRequired.push(
        `Needle Valve (NE) is not valid with spec '${spec}'. ` +
        `NE requires E/F/G series (900#/1500#/2500#: E1, E1N, F1, G1N…) ` +
        `or tubing specs (T50A, T50B, T60A, T60B, T60C).`
      );
    } else {
      // Other types remain — warn and continue generating for them
      warnings.push(
        `Needle Valve (NE) skipped — not valid with spec '${spec}' ` +
        `(NE requires E/F/G or tubing specs). ` +
        `Generating combinations for: ${finalTypes.join(", ")}.`
      );
    }
  }

  // Compute seats/bores/designs from the final (post-NE-filter) type list
  const validSeatsForTypes = finalTypes.length > 0
    ? [...new Set(finalTypes.flatMap((vt) => VALID_SEATS_BY_TYPE[vt] ?? ["T","P","M"]))]
    : SEAT_OPTIONS.map((o) => o.code);
  const finalSeats = seats.length > 0 ? seats : validSeatsForTypes;

  // End connection is rule-derived from spec — ignore whatever was in the text
  // For tubing group: all T-specs use JT, so derive from the first member
  const finalEnds = spec
    ? endConnForSpec(spec)
    : detectedSpecs
    ? endConnForSpec(detectedSpecs[0])   // "T50A" → JT
    : (endConnections.length > 0 ? endConnections : ["R"]);

  const finalBores   = bores.length   > 0 ? bores   : finalTypes.includes("BL") ? BORE_OPTIONS.map((o) => o.code)    : [];
  const finalDesigns = designs.length > 0 ? designs : finalTypes.includes("NE") ? DESIGN_OPTIONS.map((o) => o.code)  : [];
  if (valveTypes.length === 0 && missingRequired.length === 0)
    warnings.push("Valve type not specified — generating all types");
  if (seats.length === 0 && missingRequired.length === 0)
    warnings.push("Seat not specified — using rule-valid seats for each valve type");
  if (finalTypes.includes("BL") && bores.length === 0 && missingRequired.length === 0)
    warnings.push("Bore not specified — generating both Reduced and Full bore");
  if (finalTypes.includes("NE") && designs.length === 0 && missingRequired.length === 0)
    warnings.push("Design not specified — generating both Inline and Angle");

  return {
    valveTypes: finalTypes,
    seats: finalSeats,
    spec,
    specs: detectedSpecs,
    endConnections: finalEnds,
    bores: finalBores,
    designs: finalDesigns,
    missingRequired,
    warnings,
  };
}

export { COMMON_SPECS };

/** Generate all valid VDS combinations from multi-selected options (supports multiple specs) */
export function generateCombinations(
  valveTypes: string[],
  seats: string[],
  specs: string[],
  endConnections: string[],
  bores: string[],
  designs: string[]
): VdsFields[] {
  const result: VdsFields[] = [];

  for (const spec of specs) {
    const cleanSpec = spec.trim().toUpperCase();
    // Reject any spec not in the FPSO Albacora PMS whitelist
    if (!VALID_SPEC_CODES.has(cleanSpec)) continue;
    // End connection is fully determined by spec prefix — always use rule value
    const ruleEnds = endConnForSpec(cleanSpec);

    for (const vt of valveTypes) {
      // Seat must be valid for this valve type
      const ruleSeats = (VALID_SEATS_BY_TYPE[vt] ?? ["T","P","M"]).filter((s) => seats.includes(s));
      if (ruleSeats.length === 0) continue;

      // NE valve only valid with E/F/G specs or T50x/T60x tubing
      if (vt === "NE") {
        const prefix = cleanSpec[0] ?? "";
        const isHighPressure = ["E","F","G"].includes(prefix);
        const isTubing = /^T\d/.test(cleanSpec);
        if (!isHighPressure && !isTubing) continue;
      }

      // Get valid designs for this valve type
      const vtDesigns = DESIGNS_BY_TYPE[vt] ?? [];

      if (vt === "BL" || vt === "BS") {
        // Ball valves use bore (R/F) as the design character
        const activeBores = bores.filter((b) => vtDesigns.includes(b));
        const finalBores = activeBores.length > 0 ? activeBores : vtDesigns;
        for (const b of finalBores) {
          for (const s of ruleSeats) {
            for (const e of ruleEnds) {
              result.push({ valveType: vt, bore: b, seat: s, spec: cleanSpec, endConnection: e });
            }
          }
        }
      } else {
        // All other types use design character
        const activeDesigns = designs.length > 0
          ? designs.filter((d) => vtDesigns.includes(d))
          : vtDesigns;
        const finalDesigns = activeDesigns.length > 0 ? activeDesigns : [DEFAULT_DESIGN[vt] ?? ""];
        for (const d of finalDesigns) {
          for (const s of ruleSeats) {
            for (const e of ruleEnds) {
              result.push({ valveType: vt, design: d, seat: s, spec: cleanSpec, endConnection: e });
            }
          }
        }
      }
    }
  }

  return result;
}

/** Count how many combinations will be generated without building them */
export function countCombinations(
  valveTypes: string[],
  seats: string[],
  endConnections: string[],
  bores: string[],
  designs: string[],
  specsCount: number = 1,
  specs: string[] = []
): number {
  let perSpec = 0;
  // Use a representative spec for end-conn count (first spec, or fallback to endConnections)
  const sampleSpec = specs[0] ?? "";
  const ruleEnds = sampleSpec ? endConnForSpec(sampleSpec) : endConnections;

  for (const vt of valveTypes) {
    const ruleSeats = (VALID_SEATS_BY_TYPE[vt] ?? ["T","P","M"]).filter((s) => seats.includes(s));
    if (ruleSeats.length === 0) continue;
    const vtDesigns = DESIGNS_BY_TYPE[vt] ?? [];
    if (vt === "BL" || vt === "BS") {
      const activeBores = bores.filter((b) => vtDesigns.includes(b));
      perSpec += (activeBores.length || vtDesigns.length) * ruleSeats.length * ruleEnds.length;
    } else {
      const activeDesigns = designs.length > 0
        ? designs.filter((d) => vtDesigns.includes(d))
        : vtDesigns;
      perSpec += (activeDesigns.length || 1) * ruleSeats.length * ruleEnds.length;
    }
  }
  return perSpec * specsCount;
}

/** Human-readable summary of selected fields */
export function summarizeFields(fields: VdsFields): string {
  const parts: string[] = [];
  parts.push(getLabel(VALVE_TYPE_OPTIONS, fields.valveType));
  if (fields.valveType === "BL" || fields.valveType === "BS") {
    parts.push(getLabel(BORE_OPTIONS, fields.bore ?? DEFAULT_DESIGN[fields.valveType] ?? "R"));
  } else if (fields.design) {
    parts.push(getLabel(DESIGN_OPTIONS, fields.design));
  }
  parts.push(getLabel(SEAT_OPTIONS, fields.seat) + " seat");
  parts.push("Spec " + fields.spec.toUpperCase());
  parts.push(getLabel(END_CONNECTION_OPTIONS, fields.endConnection ?? "R"));
  return parts.join(" · ");
}
