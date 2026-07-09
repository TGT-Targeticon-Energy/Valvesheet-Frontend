/**
 * Generate Valvesheet — detail page (one valvesheet).
 *
 * Action buttons live in the top toolbar:
 *   • Back              → /valvesheet-workflow
 *   • Refresh           → reload the workflow
 *   • Edit Datasheet    → opens DatasheetDialog (Maker only; disabled once PREPARED is signed)
 *   • Issue Next Rev.   → opens TransitionDialog (Maker / Approver)
 *   • Void (XX)         → confirms then marks the workflow void (Approver only)
 *   • Download Current  → downloads the active revision's xlsx
 *
 * Body is the detail dashboard: header card with state badges + signature
 * track, datasheet view (with revision picker), revisions table, audit log.
 * Per-row actions (Sign / Re-prepare / xlsx) live inside the Revisions table.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Send, Lock, Loader2, Download, AlertCircle, FileSpreadsheet,
  RefreshCw, Trash2,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import {
  vswApi, type VswWorkflowDetail, type VswRevision, type VswStateMachine,
  type VswAuditEntry, type VswSigType, type VswDecision,
  type ProjectMasterEntry,
} from "@/services/vswApi";
import {
  fmt, SignatureTrack, DatasheetGrid, SignDialog, TransitionDialog,
  DatasheetDialog,
} from "./valvesheet/shared";

export default function ValvesheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = ((user as any)?.role_code || "").toUpperCase();
  const myAllowedSigs = useMemo<Set<VswSigType>>(() => {
    if (role === "MAKER") return new Set(["PREPARED"]);
    if (role === "CHECKER") return new Set(["CHECKED", "REVIEWED"]);
    if (role === "APPROVER") return new Set(["APPROVED"]);
    return new Set();
  }, [role]);
  const canCreate = role === "MAKER" || role === "APPROVER";
  const canVoid = role === "APPROVER";

  const [stateMachine, setStateMachine] = useState<VswStateMachine | null>(null);
  const [projects, setProjects] = useState<ProjectMasterEntry[]>([]);
  const [selected, setSelected] = useState<VswWorkflowDetail | null>(null);
  const [audit, setAudit] = useState<VswAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [datasheet, setDatasheet] = useState<Record<string, unknown> | null>(null);
  const [datasheetRevId, setDatasheetRevId] = useState<string | null>(null);
  const [datasheetLoading, setDatasheetLoading] = useState(false);

  const [transitionOpen, setTransitionOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signRev, setSignRev] = useState<VswRevision | null>(null);
  const [dsOpen, setDsOpen] = useState(false);

  const projectName = useCallback((pid: string) => {
    const p = projects.find(x => x.project_id === pid);
    return p ? `${p.project_name} (${p.project_id})` : pid;
  }, [projects]);

  const docNumber = useMemo(() => {
    if (!selected) return undefined;
    const proj = projects.find(x => x.project_id === selected.project_id);
    const code = proj?.sap_project_code || selected.project_id;
    return `${code}-SPE-80000-PP-SP-0001`;
  }, [selected, projects]);

  useEffect(() => {
    vswApi.getStateMachine().then(setStateMachine).catch((e) =>
      toast.error("Could not load state-machine: " + e.message)
    );
    vswApi.listProjects().then(setProjects).catch(() => {});
  }, []);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const wf = await vswApi.getWorkflow(id);
      setSelected(wf);
      const a = await vswApi.audit(id);
      setAudit(a);
      // Refetch the active datasheet snapshot so the Refresh button
      // (and any post-action reloads) picks up content changes without
      // the user needing to do a hard browser refresh.
      const revIdForDs = datasheetRevId || wf.current_revision_id;
      if (revIdForDs) {
        try {
          const d = await vswApi.getDatasheet(revIdForDs);
          setDatasheet(d.datasheet_json || {});
        } catch {
          // ignore — main reload already surfaced any error
        }
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, datasheetRevId]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (selected?.current_revision_id) setDatasheetRevId(selected.current_revision_id);
  }, [selected?.current_revision_id]);

  // Whenever the viewed revision changes, fetch its datasheet snapshot.
  useEffect(() => {
    if (!datasheetRevId) { setDatasheet(null); return; }
    let cancelled = false;
    setDatasheetLoading(true);
    vswApi.getDatasheet(datasheetRevId)
      .then((d) => { if (!cancelled) setDatasheet(d.datasheet_json || {}); })
      .catch(() => { if (!cancelled) setDatasheet(null); })
      .finally(() => { if (!cancelled) setDatasheetLoading(false); });
    return () => { cancelled = true; };
  }, [datasheetRevId]);

  const currentRev = selected?.revisions.find(r => r.id === selected.current_revision_id);
  const currentSigsMissing = useMemo(() => {
    if (!currentRev || !stateMachine) return [] as string[];
    const required = stateMachine.signatures_required[currentRev.code]?.[currentRev.is_rfq ? "rfq" : "non_rfq"] || [];
    const present = new Set(currentRev.signatures.filter(s => !s.revoked && s.decision === "APPROVED").map(s => s.signature_type));
    return required.filter(r => !present.has(r));
  }, [currentRev, stateMachine]);
  const canTransition = currentSigsMissing.length === 0 && !selected?.is_locked;

  const allowedTargets = useMemo(() => {
    if (!selected || !stateMachine) return [];
    return stateMachine.transitions[selected.current_state] || [];
  }, [selected, stateMachine]);

  const activePrepared = currentRev?.signatures.find(s => !s.revoked && s.signature_type === "PREPARED");
  const editLocked = !!activePrepared && currentRev?.status !== "REJECTED";

  async function handleTransition(args: { target_state: string; is_rfq: boolean; change_identifiers: { identifier_code?: string; description: string }[]; }) {
    if (!selected) return;
    try {
      await vswApi.transition(selected.id, args);
      toast.success(`Transitioned to ${args.target_state}`);
      setTransitionOpen(false);
      await reload();
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleSign(sigType: VswSigType, decision: VswDecision, comment: string) {
    if (!signRev) return;
    try {
      await vswApi.sign(signRev.id, {
        signature_type: sigType,
        decision,
        comment: decision === "REJECTED" ? comment : undefined,
      });
      toast.success(decision === "REJECTED" ? "Rejected" : `Signed as ${sigType}`);
      setSignOpen(false); setSignRev(null);
      await reload();
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleVoid() {
    if (!selected) return;
    if (!window.confirm("Void this valvesheet? Cannot be undone.")) return;
    try {
      await vswApi.voidWorkflow(selected.id);
      toast.success("Voided");
      await reload();
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleDownload(rev: VswRevision) {
    if (!selected) return;
    try {
      const filename = `${selected.vds_number}_${rev.revision_label || rev.code || "A"}.xlsx`;
      await vswApi.downloadExcel(rev.id, filename);
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleSaveDatasheet(json: Record<string, unknown>) {
    if (!currentRev) return;
    try {
      await vswApi.upsertDatasheet(currentRev.id, json);
      toast.success("Datasheet saved");
      setDsOpen(false);
      await reload();
      // The DatasheetGrid below the toolbar is fed by `datasheet`, which
      // is populated by a useEffect keyed on `datasheetRevId`. The
      // revision id didn't change after save, so that effect doesn't
      // re-fire — explicitly refetch the snapshot here so the grid
      // reflects the new values without a hard browser refresh.
      if (datasheetRevId) {
        try {
          const d = await vswApi.getDatasheet(datasheetRevId);
          setDatasheet(d.datasheet_json || {});
        } catch {
          // Silent — reload() already surfaced any auth/network errors
        }
      }
    } catch (e: any) { toast.error(e.message); }
  }

  if (loading && !selected) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading valvesheet…
      </div>
    );
  }
  if (!selected || !stateMachine) {
    return (
      <div className="flex flex-col items-center justify-center p-12 gap-3">
        <div className="text-muted-foreground">Valvesheet not found.</div>
        <Button variant="outline" onClick={() => navigate("/valvesheet-workflow")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to list
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-6 space-y-4 container mx-auto">
      {/* Top action bar — all top-level buttons live here */}
      <div className="flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10 bg-background py-2">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" onClick={() => navigate("/valvesheet-workflow")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold truncate max-w-[28rem]" title={selected.document_title}>
                {selected.document_title}
              </h1>
              <Badge className="font-mono">{selected.current_state}</Badge>
              <Badge variant="outline">{selected.current_phase}</Badge>
              {selected.is_locked && (
                <Badge variant="destructive"><Lock className="w-3 h-3 mr-1" />Locked</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
              <span>{projectName(selected.project_id)}</span><span>•</span>
              <span className="font-mono">{selected.vds_number}</span>
              {selected.valve_type && (<><span>•</span><span>{selected.valve_type}</span></>)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {currentRev && (
            <Button variant="outline" size="sm" onClick={() => handleDownload(currentRev)}>
              <Download className="w-4 h-4 mr-1" />
              Download {currentRev.revision_label}
            </Button>
          )}
          {!selected.is_locked && canCreate && (
            <Dialog open={dsOpen} onOpenChange={(o) => { if (!editLocked) setDsOpen(o); }}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={editLocked}
                  title={editLocked
                    ? "Datasheet locked — Maker has signed PREPARED. Wait for review or have a reviewer reject."
                    : "Edit datasheet content for the current revision"}
                >
                  {editLocked ? <Lock className="w-4 h-4 mr-1" /> : <FileSpreadsheet className="w-4 h-4 mr-1" />}
                  Edit Datasheet
                </Button>
              </DialogTrigger>
              <DatasheetDialog revision={currentRev} onSubmit={handleSaveDatasheet} />
            </Dialog>
          )}
          {!selected.is_locked && canCreate && (
            <Dialog open={transitionOpen} onOpenChange={setTransitionOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={!canTransition}>
                  <Send className="w-4 h-4 mr-1" />Issue Next Revision
                </Button>
              </DialogTrigger>
              <TransitionDialog
                allowedTargets={allowedTargets}
                currentState={selected.current_state}
                stateMachine={stateMachine}
                onSubmit={handleTransition}
              />
            </Dialog>
          )}
          {!selected.is_locked && canVoid && (
            <Button variant="destructive" size="sm" onClick={handleVoid}>
              <Trash2 className="w-4 h-4 mr-1" /> Void (XX)
            </Button>
          )}
        </div>
      </div>

      {/* Sign-off required banner */}
      {!selected.is_locked && currentSigsMissing.length > 0 && currentRev?.status !== "REJECTED" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>
            <strong>Sign-off required.</strong> Current revision still needs:{" "}
            <span className="font-mono">{currentSigsMissing.join(", ")}</span>
          </span>
        </div>
      )}

      {/* Signature progress */}
      {currentRev && stateMachine && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signature Progress — {currentRev.revision_label}</CardTitle>
            <CardDescription>
              Each slot opens only after the earlier one is signed. Rejections bounce
              back to the Maker for re-preparation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignatureTrack
              required={stateMachine.signatures_required[currentRev.code]?.[currentRev.is_rfq ? "rfq" : "non_rfq"] || []}
              signatures={currentRev.signatures}
            />
          </CardContent>
        </Card>
      )}

      {/* Datasheet for the viewed revision */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Datasheet
              {datasheetRevId && (
                <Badge variant="outline" className="font-mono">
                  {selected.revisions.find(r => r.id === datasheetRevId)?.revision_label || ""}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Each revision has its own frozen snapshot. Pick another revision below to view it.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">View revision:</Label>
            <Select value={datasheetRevId || ""} onValueChange={setDatasheetRevId}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Pick a revision" />
              </SelectTrigger>
              <SelectContent>
                {selected.revisions.map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.revision_label} · {r.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {datasheetLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : !datasheet || Object.keys(datasheet).length === 0 ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              No datasheet content captured for this revision. Use "Edit Datasheet"
              at the top to add fields.
            </div>
          ) : (
            <DatasheetGrid
              data={datasheet}
              projectName={projects.find(x => x.project_id === selected.project_id)?.project_name}
              docNumber={docNumber}
              revision={currentRev?.revision_label || currentRev?.code || "A"}
            />
          )}
        </CardContent>
      </Card>

      {/* Revisions table — per-row actions (sign / re-prepare / xlsx) live here */}
      <Card>
        <CardHeader>
          <CardTitle>Revisions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Signatures</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...selected.revisions].sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime()).map((rev) => {
                const required = stateMachine.signatures_required[rev.code]?.[rev.is_rfq ? "rfq" : "non_rfq"] || [];
                const sigsByType = new Map(rev.signatures.filter(s => !s.revoked).map(s => [s.signature_type, s]));
                const stale = !rev.included_in_history;
                const approvedSet = new Set(rev.signatures.filter(s => !s.revoked && s.decision === "APPROVED").map(s => s.signature_type));
                const nextSlot = required.find(r => !approvedSet.has(r)) as VswSigType | undefined;
                return (
                  <TableRow key={rev.id} className={stale ? "opacity-50" : ""}>
                    <TableCell className="font-mono font-semibold">
                      {rev.revision_label}
                      {rev.is_rfq && <Badge variant="outline" className="ml-2 text-xs">RFQ</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{rev.code}</TableCell>
                    <TableCell>
                      <Badge variant={
                        rev.status === "SIGNED" ? "default"
                        : (rev.status === "REJECTED" || rev.status === "VOIDED") ? "destructive"
                        : "secondary"
                      }>
                        {rev.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{fmt(rev.issued_at)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {required.map((s) => {
                          const sig = sigsByType.get(s as VswSigType);
                          if (!sig) return <Badge key={s} variant="outline" className="text-xs">{s[0]}</Badge>;
                          return (
                            <Badge key={s}
                              variant={sig.decision === "REJECTED" ? "destructive" : "default"}
                              className="text-xs"
                              title={sig.comment ? `${sig.signer_name_snapshot}: ${sig.comment}` : `${sig.signature_type} by ${sig.signer_name_snapshot}`}
                            >
                              {s[0]}{sig.decision === "REJECTED" ? "✗" : "✓"}
                            </Badge>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleDownload(rev)} title="Download .xlsx">
                          <Download className="w-3 h-3 mr-1" />xlsx
                        </Button>
                        {myAllowedSigs.size > 0 &&
                          (
                            (rev.status === "PENDING_SIGNATURES" && nextSlot && myAllowedSigs.has(nextSlot))
                            || (rev.status === "REJECTED" && myAllowedSigs.has("PREPARED"))
                          ) && (
                            <Button
                              size="sm"
                              variant={rev.status === "REJECTED" ? "default" : "outline"}
                              onClick={() => { setSignRev(rev); setSignOpen(true); }}
                            >
                              {rev.status === "REJECTED" ? "Re-prepare" : `Sign as ${nextSlot}`}
                            </Button>
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Audit log */}
      <Card>
        <CardHeader><CardTitle>Audit Log</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>From → To</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {audit.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs whitespace-nowrap">{fmt(e.performed_at)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{e.action}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{e.from_state || "—"} → {e.to_state || "—"}</TableCell>
                  <TableCell className="text-xs">{e.actor_name_snapshot || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.extra_metadata ? JSON.stringify(e.extra_metadata) : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sign dialog */}
      <Dialog open={signOpen} onOpenChange={(o) => { setSignOpen(o); if (!o) setSignRev(null); }}>
        {signRev && (
          <SignDialog
            revision={signRev}
            required={stateMachine.signatures_required[signRev.code]?.[signRev.is_rfq ? "rfq" : "non_rfq"] || []}
            myAllowedSigs={myAllowedSigs}
            onSubmit={handleSign}
          />
        )}
      </Dialog>
    </div>
  );
}
