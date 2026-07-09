/**
 * Shared building blocks for the Generate Valvesheet pages.
 * Each top-level page (List / Create / Detail) imports from here so the
 * components and helpers stay in one place.
 */
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Check, X, Circle, RotateCcw, User as UserIcon, AlertCircle, Loader2, Lock,
} from "lucide-react";
import {
  vswApi, type VswRevision, type VswStateMachine,
  type VswSigType, type VswDecision, type VswSignature,
} from "@/services/vswApi";

// ── Shared constants / formatters ─────────────────────────────────

export const STATE_LABELS: Record<string, string> = {
  A0: "A0 — IDC", R0: "R0 — Re-IDC", A1: "A1 — Review/RFQ",
  C0: "C0 — Tender", C1: "C1 — Post-Contract Review",
  D0: "D0 — Approved for Design", "00": "00 — AFC", Z1: "Z1 — As Built",
  P1: "P1 — Info", XX: "XX — Void",
};

export const fmt = (s?: string) => {
  try { return s ? new Date(s).toLocaleString() : ""; } catch { return s || ""; }
};

// VDS regex — matches the legacy generator's "complete VDS code" check
export function isLikelyCompleteVDS(code: string): boolean {
  const c = (code || "").toUpperCase().trim();
  return /^(BL|BS|BF|GA|GL|CH|DB|NE)[A-Z][MPT][A-Z0-9]{2,}(JT|R|J|F)$/.test(c);
}

// Two fields the Maker can edit on an existing revision (service + size).
export const EDITABLE_KEYS = ["service", "size_range"] as const;

// ── SignatureTrack — horizontal Prepared → Approved progress ──────

export function SignatureTrack({
  required, signatures,
}: {
  required: string[];
  signatures: VswSignature[];
}) {
  const active = new Map<string, VswSignature>();
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
              comment, edit the datasheet, and re-sign PREPARED to restart
              the cycle.
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

// ── DatasheetGrid — read-only view of a datasheet JSON, grouped ───


export function DatasheetGrid({ data, projectName, docNumber, revision }: {
  data: Record<string, unknown>;
  projectName?: string;
  docNumber?: string;
  revision?: string;
}) {
  const labelize = (key: string) =>
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const longText = (v: unknown): boolean =>
    typeof v === "string" && (v.length > 120 || v.includes("\n"));

  const groups: Record<string, string[]> = {
    "Identification": [
      "vds_no", "piping_class", "size_range", "valve_type", "service",
    ],
    "Standards & Pressure": [
      "valve_standard", "pressure_class", "design_pressure",
      "corrosion_allowance", "sour_service",
    ],
    "Construction": [
      "end_connections", "face_to_face", "operation",
      "body_construction", "seat_construction", "locks",
    ],
    "Materials": [
      "body_material", "seat_material", "seal_material",
      "gland_material", "gland_packing", "lever_handwheel",
      "spring_material", "gaskets", "bolts", "nuts",
    ],
    "Marking & Compliance": [
      "marking_purchaser", "marking_manufacturer",
      "inspection_testing", "leakage_rate",
      "material_certification", "fire_rating", "finish",
    ],
    "Testing": [
      "hydrotest_shell", "hydrotest_closure", "pneumatic_test",
    ],
  };

  const knownKeys = new Set(Object.values(groups).flat());
  const otherKeys = Object.keys(data).filter(
    (k) => !knownKeys.has(k) && k !== "notes" && k !== "fields"
  );
  if (otherKeys.length > 0) groups["Other"] = otherKeys;

  const renderValue = (v: unknown) => {
    if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
    if (typeof v === "string") return <span>{v}</span>;
    if (typeof v === "number" || typeof v === "boolean") return <span className="font-mono">{String(v)}</span>;
    return <span className="font-mono text-xs">{JSON.stringify(v)}</span>;
  };

  const notesRaw = typeof data.notes === "string" ? (data.notes as string).trim()
    : typeof data.datasheet_notes === "string" ? (data.datasheet_notes as string).trim()
    : "";
  const notesText = notesRaw && notesRaw !== "-" ? notesRaw : "";

  return (
    <div className="space-y-5">
      {/* Project metadata header */}
      <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/20 p-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Project</div>
          <div className="text-sm font-medium">{projectName || "FPSO P-82 Albacora Leste"}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Doc No.</div>
          <div className="text-sm font-medium">{docNumber || "40801-SPE-80000-PP-SP-0001"}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Revision</div>
          <div className="text-sm font-medium">{revision || "A"}</div>
        </div>
      </div>

      {Object.entries(groups).map(([title, keys]) => {
        const visibleKeys = keys.filter(k => k in data);
        if (visibleKeys.length === 0) return null;
        return (
          <div key={title}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {visibleKeys.map((k) => {
                const v = data[k];
                if (longText(v)) {
                  return (
                    <div key={k} className="md:col-span-2 rounded-md border bg-muted/20 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{labelize(k)}</div>
                      <div className="text-sm whitespace-pre-wrap">{String(v)}</div>
                    </div>
                  );
                }
                return (
                  <div key={k} className="rounded-md border bg-muted/20 p-2.5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">{labelize(k)}</div>
                    <div className="text-sm">{renderValue(v)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {notesText ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Notes</h4>
          <div className="rounded-md border bg-muted/20 p-3 text-sm whitespace-pre-wrap">
            {notesText}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── TransitionDialog — Issue next revision ────────────────────────

export function TransitionDialog({ allowedTargets, currentState, stateMachine, onSubmit }: {
  allowedTargets: string[]; currentState: string; stateMachine: VswStateMachine;
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
              {allowedTargets.map(s => <SelectItem key={s} value={s}>{STATE_LABELS[s] || s}{s === currentState && " (loop)"}</SelectItem>)}
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
            <div className="text-sm font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-600" />Change identifier required</div>
            <Input value={code} onChange={e => setCode(e.target.value)} placeholder="Code (optional)" />
            <Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="What changed?" />
          </div>
        )}
        <div className="text-xs text-muted-foreground">Signatures after issue: <span className="font-medium">{required.join(", ") || "none"}</span></div>
      </div>
      <DialogFooter>
        <Button disabled={!target || (looping && !desc.trim())}
          onClick={() => onSubmit({
            target_state: target,
            is_rfq: isRfq,
            change_identifiers: looping ? [{ identifier_code: code.trim() || undefined, description: desc.trim() }] : [],
          })}>Issue {target}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ── SignDialog — sign or reject a revision ────────────────────────

export function SignDialog({ revision, required, myAllowedSigs, onSubmit }: {
  revision: VswRevision;
  required: string[];
  myAllowedSigs: Set<VswSigType>;
  onSubmit: (sigType: VswSigType, decision: VswDecision, comment: string) => void;
}) {
  const isRejected = revision.status === "REJECTED";
  const lastRejection = revision.signatures.find(s => !s.revoked && s.decision === "REJECTED");
  const present = new Set(revision.signatures.filter(s => !s.revoked && s.decision === "APPROVED").map(s => s.signature_type));
  const nextExpected = isRejected ? "PREPARED" : (required.find(r => !present.has(r)) || null);
  const remaining = (nextExpected && myAllowedSigs.has(nextExpected as VswSigType)
    ? [nextExpected as VswSigType]
    : []
  );
  const [type, setType] = useState<VswSigType>(remaining[0] || "PREPARED");
  const [decision, setDecision] = useState<VswDecision>("APPROVED");
  const [comment, setComment] = useState("");

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {isRejected ? `Re-prepare ${revision.revision_label} after rejection` : `Sign / Reject ${revision.revision_label}`}
        </DialogTitle>
        <DialogDescription>
          {isRejected
            ? "You're addressing a rejection — re-sign PREPARED to restart the signature cycle. A short note helps reviewers see what changed."
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
            Nothing for your role to sign here. {isRejected && "Only the Maker can re-prepare a rejected revision."}
          </div>
        ) : (
          <>
            <div>
              <Label>Signature slot</Label>
              <Select value={type} onValueChange={(v) => setType(v as VswSigType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{remaining.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {/* Reject is only meaningful for downstream reviewers
                (Checker / Reviewer / Approver). The Maker originates
                the revision — there's nothing for them to reject. So
                hide the Decision radio entirely when the slot being
                signed is PREPARED. */}
            {!isRejected && type !== "PREPARED" && (
              <div>
                <Label>Decision</Label>
                <RadioGroup value={decision} onValueChange={(v) => setDecision(v as VswDecision)}>
                  <div className="flex items-center gap-2"><RadioGroupItem value="APPROVED" id="vsw-app" /><Label htmlFor="vsw-app">Approve and sign</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="REJECTED" id="vsw-rej" /><Label htmlFor="vsw-rej">Reject — send back with comment</Label></div>
                </RadioGroup>
              </div>
            )}
            <div>
              <Label>
                Comment {decision === "REJECTED" ? <span className="text-destructive">*</span> : <span className="text-muted-foreground text-xs">(optional)</span>}
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
        <Button disabled={remaining.length === 0 || !type || (decision === "REJECTED" && !comment.trim())}
          variant={decision === "REJECTED" ? "destructive" : "default"}
          onClick={() => onSubmit(type, decision, comment)}>
          {decision === "REJECTED" ? "Reject with comment" : isRejected ? `Re-sign as ${type}` : `Sign as ${type}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ── DatasheetDialog — edit service / size_range only ──────────────

export function DatasheetDialog({ revision, onSubmit }: {
  revision?: VswRevision;
  onSubmit: (json: Record<string, unknown>) => void;
}) {
  const [original, setOriginal] = useState<Record<string, unknown>>({});
  const [service, setService] = useState("");
  const [sizeRange, setSizeRange] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!revision) {
      setOriginal({}); setService(""); setSizeRange(""); return;
    }
    setLoading(true);
    vswApi.getDatasheet(revision.id)
      .then(d => {
        const data = (d.datasheet_json || {}) as Record<string, unknown>;
        setOriginal(data);
        setService(typeof data.service === "string" ? data.service : "");
        setSizeRange(typeof data.size_range === "string" ? data.size_range : "");
      })
      .catch(() => { setOriginal({}); setService(""); setSizeRange(""); })
      .finally(() => setLoading(false));
  }, [revision?.id]);

  const labelize = (key: string) =>
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const renderRO = (v: unknown) => {
    if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
    if (typeof v === "string") return <span className="text-sm">{v}</span>;
    if (typeof v === "number" || typeof v === "boolean") return <span className="font-mono text-sm">{String(v)}</span>;
    return <span className="font-mono text-[11px]">{JSON.stringify(v)}</span>;
  };

  const readOnlyKeys = Object.keys(original).filter(
    (k) => !EDITABLE_KEYS.includes(k as any) && k !== "notes"
  );

  function handleSave() {
    const merged: Record<string, unknown> = {
      ...original,
      service: service.trim(),
      size_range: sizeRange.trim(),
    };
    onSubmit(merged);
  }

  return (
    <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Edit Datasheet for {revision?.revision_label}</DialogTitle>
        <DialogDescription>
          Only <span className="font-medium">Service</span> and{" "}
          <span className="font-medium">Size Range</span> are editable. All
          other fields are decoded from the VDS code and stay frozen for
          traceability.
        </DialogDescription>
      </DialogHeader>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading datasheet…
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Editable Fields
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ds-service">Service</Label>
                <Input
                  id="ds-service"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  placeholder="e.g. Crude Oil, Natural Gas, Produced Water"
                />
              </div>
              <div>
                <Label htmlFor="ds-size-range">Size Range</Label>
                <Input
                  id="ds-size-range"
                  value={sizeRange}
                  onChange={(e) => setSizeRange(e.target.value)}
                  placeholder='e.g. 1/2" – 24"'
                />
              </div>
            </div>
          </div>

          {readOnlyKeys.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                <Lock className="w-3 h-3" /> Read-only (decoded from VDS)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {readOnlyKeys.map((k) => (
                  <div key={k} className="rounded-md border bg-muted/30 p-2.5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                      {labelize(k)}
                    </div>
                    <div>{renderRO(original[k])}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {typeof original.notes === "string" && (original.notes as string).trim() && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                <Lock className="w-3 h-3" /> Notes (read-only)
              </h4>
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {String(original.notes)}
              </div>
            </div>
          )}
        </div>
      )}

      <DialogFooter>
        <Button disabled={loading} onClick={handleSave}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}
