/**
 * Shared building blocks for the Generate PMS Datasheet pages.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Check, X, Circle, RotateCcw, User as UserIcon, AlertCircle, Loader2, Lock,
  ChevronDown, ChevronRight,
} from "lucide-react";
import {
  pmsWorkflowApi,
  type PmsRevision,
  type PmsStateMachine,
  type PmsSigType,
  type PmsDecision,
  type PmsSignature,
  type PmsOptions,
} from "@/services/pmsWorkflowApi";
import pmsApi from "@/services/pmsApi";

export const STATE_LABELS: Record<string, string> = {
  A0: "A0 — IDC", R0: "R0 — Re-IDC", A1: "A1 — Review/RFQ",
  C0: "C0 — Tender", C1: "C1 — Post-Contract Review",
  D0: "D0 — Approved for Design", "00": "00 — AFC", Z1: "Z1 — As Built",
  P1: "P1 — Info", XX: "XX — Void",
};

export const fmt = (s?: string) => {
  try { return s ? new Date(s).toLocaleString() : ""; } catch { return s || ""; }
};

export const PMS_EDITABLE_KEYS = ["service", "design_pressure_barg", "design_temp_c"] as const;

// ─── Collapsible section wrapper ────────────────────────────────────
function Section({ title, defaultOpen = true, children }: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/50 hover:bg-muted text-sm font-semibold text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span>{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

// ─── Info grid (label+value pairs) ──────────────────────────────────
function InfoGrid({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map(({ label, value }) => (
        <div key={label} className="bg-muted/30 rounded-md px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</div>
          <div className="text-sm font-medium">{value ?? <span className="text-muted-foreground">—</span>}</div>
        </div>
      ))}
    </div>
  );
}

// ─── SignatureTrack — Prepared → Approved progress bar ─────────────
export function PmsSignatureTrack({
  required, signatures,
}: {
  required: string[];
  signatures: PmsSignature[];
}) {
  const active = new Map<string, PmsSignature>();
  const lastRejection = signatures.find(s => !s.revoked && s.decision === "REJECTED") || null;
  for (const s of signatures) {
    if (!s.revoked) active.set(s.signature_type, s);
  }
  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-0">
        {required.map((slot, i) => {
          const sig = active.get(slot);
          const isApproved = sig && sig.decision === "APPROVED";
          const isRejected = sig && sig.decision === "REJECTED";
          const isPending = !sig;
          return (
            <div key={slot} className="flex-1 flex items-center">
              <div className="flex-1 flex flex-col items-center">
                <div className={[
                  "w-9 h-9 rounded-full flex items-center justify-center border-2",
                  isApproved && "bg-emerald-500 border-emerald-600 text-white",
                  isRejected && "bg-red-500 border-red-600 text-white",
                  isPending && "bg-muted border-muted-foreground/30 text-muted-foreground",
                ].filter(Boolean).join(" ")}>
                  {isApproved && <Check className="w-4 h-4" />}
                  {isRejected && <X className="w-4 h-4" />}
                  {isPending && <Circle className="w-4 h-4" />}
                </div>
                <div className="mt-1.5 text-[10px] uppercase tracking-wide font-medium text-foreground">{slot}</div>
                {sig && (
                  <div className="mt-1 text-[10px] text-muted-foreground text-center max-w-[12rem] truncate" title={sig.signer_name_snapshot || ""}>
                    {sig.signer_name_snapshot || sig.signed_by_user_id}
                  </div>
                )}
                {sig?.signed_at && (
                  <div className="text-[9px] text-muted-foreground">{fmt(sig.signed_at).split(",")[0]}</div>
                )}
              </div>
              {i < required.length - 1 && (
                <div className={[
                  "h-0.5 flex-shrink-0 w-8",
                  active.get(required[i])?.decision === "APPROVED" ? "bg-emerald-500" : "bg-muted-foreground/20",
                ].join(" ")} />
              )}
            </div>
          );
        })}
      </div>

      {lastRejection && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900 flex items-start gap-2">
          <RotateCcw className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium">
              Rejected by {lastRejection.signer_name_snapshot || "—"} on {fmt(lastRejection.signed_at)} ({lastRejection.signature_type}):
            </div>
            <div className="mt-1 italic">"{lastRejection.comment || "(no comment)"}"</div>
            <div className="mt-2 text-[11px]">
              Earlier signatures have been revoked. Maker must address the
              comment, edit the snapshot, and re-sign PREPARED to restart the cycle.
            </div>
          </div>
        </div>
      )}

      {active.get("PREPARED")?.comment && !lastRejection && (
        <div className="rounded-md border bg-muted/30 p-2 text-xs flex items-start gap-2">
          <UserIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
          <div>
            <span className="font-medium">Maker note:</span>{" "}
            <span className="text-muted-foreground italic">"{active.get("PREPARED")!.comment}"</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PmsSnapshotView — structured read-only view of the payload ────
export function PmsSnapshotView({ payload }: { payload: Record<string, unknown> }) {
  const p = payload;

  // ── 1. Identification & Design Conditions ──
  const dc = (p.design_conditions as any) || {};
  const eff = (p.effective_design_conditions as any) || {};
  const adequacy = p.adequacy as any;
  const derived = (p.derived_conditions as any) || {};

  // ── 2. P-T curve table ──
  const pt = p.pressure_temperature as any;
  const ptTemps: number[] = pt?.temperatures_c || [];
  const ptPressures: number[] = pt?.pressures_barg || [];
  const ptRows = ptTemps.map((t: number, i: number) => ({
    temp_c: t,
    pressure_barg: ptPressures[i] ?? null,
  }));

  // ── 3. Wall thickness table ──
  const wt = p.wall_thickness as any;
  const wtRows: any[] = wt?.rows || [];
  const wtSummary = wt?.summary as any;
  const wtFlags: any[] = wt?.flags || [];
  const wtUnavailable: boolean = wt?.unavailable || false;
  const wtUnavailableReason: string = wt?.unavailable_reason || "";

  // ── 4. Materials ──
  const mat = p.materials_tab as any;
  const smallBoreRows: any[] = mat?.small_bore?.rows || [];
  const largeBoreRows: any[] = mat?.large_bore?.rows || [];

  // ── 5. Code factors ──
  const cf = (p.code_factors as any) || {};
  const branchChart: any[] = cf.branch_chart || [];

  // ── 6. Notes ──
  const notes: any[] = (p.project_notes as any[]) || [];

  const num = (v: unknown, decimals = 2) =>
    v == null ? "—" : typeof v === "number" ? v.toFixed(decimals) : String(v);

  return (
    <div className="space-y-3">

      {/* ── Identification ── */}
      <Section title="Identification">
        <InfoGrid items={[
          { label: "Class Code",     value: String(p.class_code || p.base_class_code || "—") },
          { label: "Base Class",     value: p.base_class_code ? String(p.base_class_code) : null },
          { label: "Rating",         value: String(p.rating || "—") },
          { label: "Material",       value: String(p.material || "—") },
          { label: "Corrosion Allow.", value: String(p.corrosion_allowance || p.digit || "—") },
          { label: "Service",        value: p.service ? String(p.service) : null },
          { label: "Letter",         value: p.letter ? String(p.letter) : null },
          { label: "Digit",          value: p.digit  ? String(p.digit)  : null },
          { label: "Suffix",         value: p.suffix ? String(p.suffix) : null },
        ].filter(i => i.value !== null)} />
        {p.note && (
          <p className="mt-3 text-xs text-muted-foreground italic border-t pt-2">
            Note: {String(p.note)}
          </p>
        )}
      </Section>

      {/* ── Design Conditions ── */}
      <Section title="Design Conditions">
        <div className="space-y-3">
          {adequacy && (
            <div className={[
              "rounded-md border px-3 py-2 text-sm font-medium flex items-center gap-2",
              adequacy.adequate
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-red-300 bg-red-50 text-red-800",
            ].join(" ")}>
              {adequacy.adequate ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {adequacy.adequate ? "ADEQUATE" : "INADEQUATE"}
              {adequacy.rated_p_at_design_t != null && (
                <span className="font-normal text-xs ml-1">
                  (Rated P @ design T = {num(adequacy.rated_p_at_design_t)} barg)
                </span>
              )}
            </div>
          )}
          <InfoGrid items={[
            // Top-level values are updated by upsert_snapshot (the editable knobs).
            // Fall back to nested design_conditions / effective_design_conditions
            // only when the top-level field is absent (older snapshots).
            { label: "Design Pressure (barg)", value: num(p.design_pressure_barg ?? dc.design_pressure_barg ?? eff.design_pressure_barg) },
            { label: "Design Temp (°C)",       value: num(p.design_temp_c ?? dc.design_temp_c ?? eff.design_temp_c, 1) },
            { label: "MDMT (°C)",              value: num(p.mdmt_c ?? dc.mdmt_c ?? eff.mdmt_c) },
            { label: "Joint Type",             value: String(p.joint_type ?? dc.joint_type ?? eff.joint_type ?? "—") },
          ]} />
          {Object.keys(derived).length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
              {derived.pressure?.hydrotest_barg != null && (
                <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs">
                  <div className="text-muted-foreground">Hydrotest (barg)</div>
                  <div className="font-semibold">{num(derived.pressure.hydrotest_barg)}</div>
                </div>
              )}
              {derived.pressure?.operating_barg != null && (
                <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs">
                  <div className="text-muted-foreground">Operating 80% (barg)</div>
                  <div className="font-semibold">{num(derived.pressure.operating_barg)}</div>
                </div>
              )}
              {derived.temperature?.design_f != null && (
                <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs">
                  <div className="text-muted-foreground">Design Temp (°F)</div>
                  <div className="font-semibold">{num(derived.temperature.design_f, 1)}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* ── Pressure-Temperature Table ── */}
      {ptRows.length > 0 && (
        <Section title={`Pressure-Temperature Curve (${ptRows.length} points)`} defaultOpen={false}>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">Temperature (°C)</TableHead>
                  <TableHead className="text-xs">Rated Pressure (barg)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ptRows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-mono">{num(row.temp_c, 0)}</TableCell>
                    <TableCell className="text-sm font-mono">{num(row.pressure_barg)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pt?.hottest_point && (
            <p className="text-xs text-muted-foreground mt-2">
              Hottest point: {num(pt.hottest_point.temperature_c, 0)} °C @ {num(pt.hottest_point.pressure_barg)} barg
            </p>
          )}
        </Section>
      )}

      {/* ── Wall Thickness ── */}
      <Section title="Wall Thickness Table">
        {wtUnavailable ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            {wtUnavailableReason || "Wall thickness unavailable at this design point."}
          </div>
        ) : wtRows.length > 0 ? (
          <div className="space-y-3">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs whitespace-nowrap">NPS</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">OD (mm)</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Schedule</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Sel. WT (mm)</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Calc. T (mm)</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Min T (mm)</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">MAWP (barg)</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Margin (%)</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wtRows.map((row: any, i: number) => (
                    <TableRow key={i} className={row.sch_status === "NOT OK" ? "bg-red-50" : ""}>
                      <TableCell className="font-mono text-sm font-semibold">{row.nps}</TableCell>
                      <TableCell className="font-mono text-sm">{num(row.od_mm)}</TableCell>
                      <TableCell className="text-sm">{row.sch_display || "—"}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.sel_thk_mm_display || num(row.sel_thk_mm)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{num(row.calc_thk_mm)}</TableCell>
                      <TableCell className="font-mono text-sm">{num(row.tm_mm)}</TableCell>
                      <TableCell className="font-mono text-sm">{num(row.mawp_barg)}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.margin_pct != null ? `${num(row.margin_pct, 1)}%` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={row.sch_status === "NOT OK" ? "destructive" : row.sch_status === "OK" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {row.sch_status || "—"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {wtSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "Min MAWP (barg)",   value: num(wtSummary.min_mawp_barg) },
                  { label: "Max MAWP (barg)",   value: num(wtSummary.max_mawp_barg) },
                  { label: "Hydrotest (barg)",  value: num(wtSummary.hydrotest_barg) },
                  { label: "Sizes",             value: String(wtSummary.total_nps_sizes ?? "—") },
                  { label: "Mill Tolerance",    value: wtSummary.mill_tolerance != null ? `${(wtSummary.mill_tolerance * 100).toFixed(0)}%` : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-muted/30 rounded-md px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                    <div className="text-sm font-semibold font-mono">{value}</div>
                  </div>
                ))}
              </div>
            )}

            {wtFlags.length > 0 && (
              <div className="space-y-1">
                {wtFlags.map((f: any, i: number) => (
                  <div key={i} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                    {typeof f === "string" ? f : f.message || JSON.stringify(f)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No wall thickness data.</div>
        )}
      </Section>

      {/* ── Materials ── */}
      {(smallBoreRows.length > 0 || largeBoreRows.length > 0) && (
        <Section title="Materials">
          <div className="space-y-4">
            {[
              { label: `Small Bore — ${mat?.small_bore?.range || 'NPS ½"–2"'}`, rows: smallBoreRows, conn: mat?.small_bore?.connection },
              { label: `Large Bore — ${mat?.large_bore?.range || 'NPS 2½"–36"'}`, rows: largeBoreRows, conn: mat?.large_bore?.connection },
            ].map(({ label, rows, conn }) => rows.length > 0 && (
              <div key={label}>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</h5>
                  {conn && <span className="text-xs text-muted-foreground">— {conn}</span>}
                </div>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-xs">Component</TableHead>
                        <TableHead className="text-xs">Material</TableHead>
                        <TableHead className="text-xs">Schedule</TableHead>
                        <TableHead className="text-xs">Standard</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm font-medium">{row.component || "—"}</TableCell>
                          <TableCell className="text-sm">{row.material || "—"}</TableCell>
                          <TableCell className="text-sm font-mono">{row.schedule || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.standard || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Branch Chart ── */}
      {branchChart.length > 0 && (
        <Section title="Branch Chart" defaultOpen={false}>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">Run NPS</TableHead>
                  <TableHead className="text-xs">Branch NPS</TableHead>
                  <TableHead className="text-xs">Connection</TableHead>
                  <TableHead className="text-xs">Reinforcement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchChart.map((row: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm">{row.run_nps ?? row.run ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{row.branch_nps ?? row.branch ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.connection ?? row.type ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.reinforcement ?? row.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      )}

      {/* ── Project Notes ── */}
      {notes.length > 0 && (
        <Section title={`Project Notes (${notes.length})`} defaultOpen={false}>
          <div className="space-y-2">
            {notes.map((n: any, i: number) => (
              <div key={i} className="flex gap-3 text-sm border-b last:border-0 pb-2 last:pb-0">
                <span className="font-mono text-xs text-muted-foreground min-w-[2rem] pt-0.5">
                  {n.id ?? i + 1}
                </span>
                <span>{n.text ?? String(n)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── TransitionDialog ───────────────────────────────────────────────
export function PmsTransitionDialog({ allowedTargets, currentState, stateMachine, onSubmit }: {
  allowedTargets: string[];
  currentState: string;
  stateMachine: PmsStateMachine;
  onSubmit: (a: { target_state: string; is_rfq: boolean; change_identifiers: { identifier_code?: string; description: string }[] }) => void;
}) {
  const [target, setTarget] = useState(allowedTargets[0] || "");
  const [isRfq, setIsRfq] = useState(false);
  const [code, setCode] = useState("");
  const [desc, setDesc] = useState("");
  const looping = target === currentState;
  const required = stateMachine.signatures_required[target]?.[isRfq ? "rfq" : "non_rfq"] || [];
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Issue Next Revision</DialogTitle>
        <DialogDescription>Currently at <span className="font-mono">{currentState}</span></DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Target State</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {allowedTargets.map(s => (
                <SelectItem key={s} value={s}>
                  {STATE_LABELS[s] || s}{s === currentState && " (loop)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {target === "A1" && (
          <label className="flex items-center gap-2 text-sm rounded-md bg-muted/50 p-2">
            <input type="checkbox" checked={isRfq} onChange={e => setIsRfq(e.target.checked)} />
            Issued as RFQ (forces Approved signature)
          </label>
        )}
        {looping && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />Change identifier required
            </div>
            <Input value={code} onChange={e => setCode(e.target.value)} placeholder="Code (optional)" />
            <Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="What changed?" />
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          Signatures after issue: <span className="font-medium">{required.join(", ") || "none"}</span>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!target || (looping && !desc.trim())}
          onClick={() => onSubmit({
            target_state: target,
            is_rfq: isRfq,
            change_identifiers: looping
              ? [{ identifier_code: code.trim() || undefined, description: desc.trim() }]
              : [],
          })}
        >
          Issue {target}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── SignDialog ────────────────────────────────────────────────────
export function PmsSignDialog({ revision, required, myAllowedSigs, onSubmit }: {
  revision: PmsRevision;
  required: string[];
  myAllowedSigs: Set<PmsSigType>;
  onSubmit: (sigType: PmsSigType, decision: PmsDecision, comment: string) => void;
}) {
  const isRejected = revision.status === "REJECTED";
  const lastRejection = revision.signatures.find(s => !s.revoked && s.decision === "REJECTED");
  const present = new Set(revision.signatures.filter(s => !s.revoked && s.decision === "APPROVED").map(s => s.signature_type));
  const nextExpected = isRejected ? "PREPARED" : (required.find(r => !present.has(r)) || null);
  const remaining = (nextExpected && myAllowedSigs.has(nextExpected as PmsSigType)
    ? [nextExpected as PmsSigType]
    : []
  );
  const [type, setType] = useState<PmsSigType>(remaining[0] || "PREPARED");
  const [decision, setDecision] = useState<PmsDecision>("APPROVED");
  const [comment, setComment] = useState("");

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {isRejected ? `Re-prepare ${revision.revision_label} after rejection` : `Sign / Reject ${revision.revision_label}`}
        </DialogTitle>
        <DialogDescription>
          {isRejected
            ? "Address the rejection — re-sign PREPARED to restart the cycle."
            : "You will sign as the currently logged-in user."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        {isRejected && lastRejection && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900">
            <div className="font-medium">
              Previous rejection by {lastRejection.signer_name_snapshot} ({lastRejection.signature_type}):
            </div>
            <div className="mt-1 italic">"{lastRejection.comment}"</div>
          </div>
        )}
        {remaining.length === 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            Nothing for your role to sign here.
            {isRejected && " Only the Maker can re-prepare a rejected revision."}
          </div>
        ) : (
          <>
            <div>
              <Label>Signature slot</Label>
              <Select value={type} onValueChange={(v) => setType(v as PmsSigType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {remaining.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!isRejected && type !== "PREPARED" && (
              <div>
                <Label>Decision</Label>
                <RadioGroup value={decision} onValueChange={(v) => setDecision(v as PmsDecision)}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="APPROVED" id="pms-app" />
                    <Label htmlFor="pms-app">Approve and sign</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="REJECTED" id="pms-rej" />
                    <Label htmlFor="pms-rej">Reject — send back with comment</Label>
                  </div>
                </RadioGroup>
              </div>
            )}
            <div>
              <Label>
                Comment{" "}
                {decision === "REJECTED"
                  ? <span className="text-destructive">*</span>
                  : <span className="text-muted-foreground text-xs">(optional)</span>}
              </Label>
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={
                  decision === "REJECTED"
                    ? "What needs to be fixed before this can be signed?"
                    : isRejected
                    ? "What did you change to address the rejection?"
                    : "Anything reviewers should know? (optional)"
                }
              />
            </div>
          </>
        )}
      </div>
      <DialogFooter>
        <Button
          disabled={remaining.length === 0 || !type || (decision === "REJECTED" && !comment.trim())}
          variant={decision === "REJECTED" ? "destructive" : "default"}
          onClick={() => onSubmit(type, decision, comment)}
        >
          {decision === "REJECTED" ? "Reject with comment" : isRejected ? `Re-sign as ${type}` : `Sign as ${type}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── ServiceMultiSelect — shared checkbox-popover for services ──────
// Mirrors the same component in PMSGeneratorPage so the Edit Snapshot
// dialog and the Generator page stay visually identical.
export function ServiceMultiSelect({
  options,
  allowCustom,
  selected,
  custom,
  onToggle,
  onCustomChange,
}: {
  options: string[];
  allowCustom: boolean;
  selected: string[];
  custom: string;
  onToggle: (svc: string, checked: boolean) => void;
  onCustomChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = useMemo(() => {
    const all = [...selected, ...(custom.trim() ? [custom.trim()] : [])];
    if (all.length === 0) return "Select one or more services…";
    const joined = all.join(", ");
    return joined.length > 60 ? joined.slice(0, 57) + "…" : joined;
  }, [selected, custom]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-1 w-full flex items-center justify-between px-3 py-2 text-sm border border-input bg-background rounded-md hover:bg-accent/30 transition-colors"
        >
          <span className={selected.length === 0 && !custom ? "text-muted-foreground" : ""}>
            {summary}
          </span>
          <ChevronDown className="w-4 h-4 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="max-h-64 overflow-y-auto">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/40 cursor-pointer"
            >
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={(c) => onToggle(opt, c === true)}
              />
              <span className="flex-1">{opt}</span>
            </label>
          ))}
        </div>
        {allowCustom && (
          <>
            <Separator />
            <div className="p-2">
              <Label htmlFor="pms-custom-service" className="text-xs">Other (custom)</Label>
              <Input
                id="pms-custom-service"
                value={custom}
                placeholder="Type a custom service description"
                onChange={(e) => onCustomChange(e.target.value)}
                className="mt-1 h-8 text-sm"
              />
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── PmsSnapshotDialog — edit service / pressure / temperature ─────
// Service is a dropdown matching the PMS Generator page options.
// When design pressure or temperature change the full snapshot is
// re-computed live via the same /api/compute-pms endpoint used by
// the Generator page, so wall thickness, adequacy, etc. stay in sync.
// On save the full recomputed payload is stored (full_replace=true).
export function PmsSnapshotDialog({ revision, onSubmit }: {
  revision?: PmsRevision;
  onSubmit: (payload: Record<string, unknown>, fullReplace: boolean) => void;
}) {
  // ── Fetched data ──
  const [options, setOptions] = useState<PmsOptions | null>(null);
  const [original, setOriginal] = useState<Record<string, unknown>>({});
  const [computed, setComputed] = useState<Record<string, unknown>>({});

  // ── Service multi-select state (mirrors PMSGeneratorPage) ──
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [customService, setCustomService] = useState("");
  const service = useMemo(() => {
    const all = [...selectedServices, ...(customService.trim() ? [customService.trim()] : [])];
    return all.join(", ");
  }, [selectedServices, customService]);

  // ── Design condition knobs ──
  const [designP, setDesignP] = useState("");
  const [designT, setDesignT] = useState("");

  // ── UI state ──
  const [loading, setLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load service options once ──
  useEffect(() => {
    pmsWorkflowApi.getOptions()
      .then(setOptions)
      .catch(() => {/* options are optional — fall back gracefully */});
  }, []);

  // ── Parse a stored service string back into selected[] + custom ──
  function _parseService(svc: string, knownOptions: string[]) {
    const parts = svc.split(",").map(s => s.trim()).filter(Boolean);
    const known: string[] = [];
    const custom: string[] = [];
    for (const p of parts) {
      if (knownOptions.includes(p)) known.push(p);
      else custom.push(p);
    }
    return { known, custom: custom.join(", ") };
  }

  // ── Load snapshot when revision changes ──
  useEffect(() => {
    if (!revision) {
      setOriginal({}); setComputed({});
      setSelectedServices([]); setCustomService("");
      setDesignP(""); setDesignT("");
      return;
    }
    setLoading(true);
    pmsWorkflowApi.getSnapshot(revision.id)
      .then(d => {
        const data = (d.payload || {}) as Record<string, unknown>;
        setOriginal(data);
        setComputed(data);
        const storedSvc = typeof data.service === "string" ? data.service : "";
        // Options may not be loaded yet — re-parse when options arrive
        const knownOpts = options?.services ?? [];
        const { known, custom } = _parseService(storedSvc, knownOpts);
        setSelectedServices(known.length > 0 ? known : []);
        setCustomService(known.length === 0 && storedSvc ? storedSvc : custom);
        setDesignP(data.design_pressure_barg != null ? String(data.design_pressure_barg) : "");
        setDesignT(data.design_temp_c != null ? String(data.design_temp_c) : "");
      })
      .catch(() => {
        setOriginal({}); setComputed({});
        setSelectedServices([]); setCustomService("");
        setDesignP(""); setDesignT("");
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision?.id]);

  // Re-parse service into known/custom once options are loaded
  useEffect(() => {
    if (!options || !Object.keys(original).length) return;
    const storedSvc = typeof original.service === "string" ? original.service : "";
    const { known, custom } = _parseService(storedSvc, options.services);
    setSelectedServices(known);
    setCustomService(known.length > 0 ? custom : (known.length === 0 && storedSvc ? storedSvc : custom));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const toggleService = (svc: string, checked: boolean) => {
    setSelectedServices(prev => checked ? [...prev, svc] : prev.filter(s => s !== svc));
  };

  // ── Live recompute when P, T, or service changes (debounced 400 ms) ──
  const triggerRecompute = useCallback((
    p: string, t: string, svc: string, snap: Record<string, unknown>,
  ) => {
    const rating = (snap.rating || snap.class_code || "") as string;
    const material = (snap.material || "") as string;
    const ca = (snap.corrosion_allowance || snap.digit || "") as string;
    if (!rating || !material || !ca) return;

    const pNum = p.trim() === "" ? null : Number(p);
    const tNum = t.trim() === "" ? null : Number(t);

    setRecomputing(true);
    pmsApi.computePMS({
      rating,
      material,
      corrosion_allowance: ca,
      service: svc.trim() || undefined,
      design_pressure_barg: pNum,
      design_temp_c: tNum,
      mdmt_c: (snap.mdmt_c ?? null) as number | null,
      joint_type: (snap.joint_type ?? undefined) as string | undefined,
    })
      .then(result => {
        const merged: Record<string, unknown> = {
          ...result as unknown as Record<string, unknown>,
          service: svc.trim(),
          design_pressure_barg: pNum,
          design_temp_c: tNum,
          rating,
          material,
          corrosion_allowance: ca,
          mdmt_c: snap.mdmt_c ?? null,
          joint_type: snap.joint_type ?? null,
        };
        setComputed(merged);
      })
      .catch(() => {/* keep previous on error */})
      .finally(() => setRecomputing(false));
  }, []);

  // Debounce changes → recompute
  useEffect(() => {
    if (loading || !Object.keys(original).length) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      triggerRecompute(designP, designT, service, original);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designP, designT, service]);

  // ── Save handler ──
  function handleSave() {
    const hasRecomputed = Object.keys(computed).length > 0 && computed !== original;
    if (hasRecomputed) {
      onSubmit(computed, true);
    } else {
      onSubmit({
        service: service.trim(),
        design_pressure_barg: designP.trim() === "" ? null : Number(designP),
        design_temp_c: designT.trim() === "" ? null : Number(designT),
      }, false);
    }
  }

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Edit Snapshot — {revision?.revision_label}</DialogTitle>
        <DialogDescription>
          Edit <span className="font-medium">Service</span>,{" "}
          <span className="font-medium">Design Pressure</span>, and{" "}
          <span className="font-medium">Design Temperature</span>. Changing
          pressure or temperature automatically re-runs the PMS engine to
          update wall thickness, adequacy, and all other calculated values.
        </DialogDescription>
      </DialogHeader>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading snapshot…
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── Editable fields ── */}
          <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-primary/80 flex-1">
                Editable Fields
              </h4>
              {recomputing && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Recomputing…
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Service — multi-select (same as PMS Generator page) */}
              <div>
                <Label>Service Description</Label>
                <ServiceMultiSelect
                  options={options?.services ?? []}
                  allowCustom={options?.services_allow_custom ?? true}
                  selected={selectedServices}
                  custom={customService}
                  onToggle={toggleService}
                  onCustomChange={setCustomService}
                />
              </div>

              {/* Design Pressure */}
              <div>
                <Label htmlFor="pms-dp">Design Pressure (barg)</Label>
                <Input
                  id="pms-dp"
                  type="number"
                  value={designP}
                  onChange={(e) => setDesignP(e.target.value)}
                  placeholder="e.g. 50"
                />
              </div>

              {/* Design Temperature */}
              <div>
                <Label htmlFor="pms-dt">Design Temperature (°C)</Label>
                <Input
                  id="pms-dt"
                  type="number"
                  value={designT}
                  onChange={(e) => setDesignT(e.target.value)}
                  placeholder="e.g. 120"
                />
              </div>
            </div>
          </div>

          {/* ── Live snapshot preview ── */}
          {Object.keys(computed).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                {recomputing
                  ? <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
                  : <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {recomputing ? "Recomputing Preview…" : "Live Preview"}
                </h4>
              </div>
              <PmsSnapshotView payload={computed} />
            </div>
          )}
        </div>
      )}

      <DialogFooter>
        <Button disabled={loading || recomputing} onClick={handleSave}>
          {recomputing
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Recomputing…</>
            : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
