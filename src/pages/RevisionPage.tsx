import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  FilePlus2,
  Lock,
  Send,
  Loader2,
  Info,
  AlertCircle,
} from "lucide-react";
import pmsApi, { PipeClassListItem } from "@/services/pmsApi";
import {
  Workflow,
  WorkflowDetail,
  Revision,
  AuditLogEntry,
  StateMachineInfo,
  ProjectListItem,
  listWorkflows,
  getWorkflow,
  createWorkflow,
  transitionWorkflow,
  voidWorkflow,
  issueInfo,
  signRevision,
  getAuditLog,
  getStateMachine,
  listProjects,
} from "@/services/revisionApi";

const STATE_LABELS: Record<string, string> = {
  INITIAL: "Initial",
  A0: "A0 — IDC",
  R0: "R0 — Re-IDC",
  A1: "A1 — Review/RFQ",
  C0: "C0 — Tender/AFF",
  C1: "C1 — Post-Contract Review",
  D0: "D0 — Approved for Design",
  "00": "00 — AFC / POS",
  Z1: "Z1 — As Built",
  P1: "P1 — For Information",
  XX: "XX — Voided",
};

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function StatePhaseBadge({ state, phase }: { state: string; phase: string }) {
  const phaseColor =
    phase === "POST_CONTRACT"
      ? "bg-emerald-100 text-emerald-800"
      : phase === "PRE_CONTRACT"
      ? "bg-amber-100 text-amber-800"
      : "bg-amber-100 text-amber-800";
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={phaseColor}>
        {phase}
      </Badge>
      <Badge className="text-base font-mono">{state}</Badge>
    </div>
  );
}

// ============================================================
// Main page
// ============================================================
export default function RevisionPage() {
  const { user } = useAuth();
  const myRole = (user?.role_code || "").toUpperCase();
  // What signature types can the current user apply?
  const myAllowedSigs = useMemo<Set<string>>(() => {
    if (myRole === "MAKER") return new Set(["PREPARED"]);
    if (myRole === "CHECKER") return new Set(["CHECKED", "REVIEWED"]);
    if (myRole === "APPROVER") return new Set(["APPROVED"]);
    return new Set();
  }, [myRole]);
  const canVoid = myRole === "APPROVER";
  const canIssueOrCreate =
    myRole === "MAKER" || myRole === "APPROVER";

  const [projectId, setProjectId] = useState<string>("");
  const [pmsClassId, setPmsClassId] = useState<string>("");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [pmsClasses, setPmsClasses] = useState<PipeClassListItem[]>([]);
  const [mastersLoading, setMastersLoading] = useState(true);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selected, setSelected] = useState<WorkflowDetail | null>(null);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [stateMachine, setStateMachine] = useState<StateMachineInfo | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signRev, setSignRev] = useState<Revision | null>(null);

  // Load state machine info + master data (projects, PMS classes) on mount
  useEffect(() => {
    getStateMachine()
      .then(setStateMachine)
      .catch((e) =>
        toast.error(
          `Could not load revision state machine: ${e?.message || "unknown error"}. Make sure the backend is running and you are logged in.`,
        ),
      );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMastersLoading(true);
    Promise.allSettled([listProjects(), pmsApi.listPipeClasses()]).then(
      ([projRes, pmsRes]) => {
        if (cancelled) return;
        if (projRes.status === "fulfilled") {
          setProjects(projRes.value);
        } else {
          toast.error(
            `Failed to load projects: ${projRes.reason?.message || projRes.reason}`,
          );
        }
        if (pmsRes.status === "fulfilled") {
          setPmsClasses(pmsRes.value);
        } else {
          toast.error(
            `Failed to load PMS classes: ${pmsRes.reason?.message || pmsRes.reason}`,
          );
        }
        setMastersLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Reload workflows whenever the project / PMS selection changes
  const reloadWorkflows = useCallback(async () => {
    if (!projectId || !pmsClassId) {
      setWorkflows([]);
      setSelected(null);
      setAudit([]);
      return;
    }
    setLoading(true);
    try {
      const list = await listWorkflows({
        project_id: projectId,
        pms_class_id: pmsClassId,
      });
      setWorkflows(list);
      // Auto-load the first workflow if one exists
      if (list.length > 0) {
        await loadWorkflowDetail(list[0].id);
      } else {
        setSelected(null);
        setAudit([]);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to load workflows");
    } finally {
      setLoading(false);
    }
  }, [projectId, pmsClassId]);

  useEffect(() => {
    void reloadWorkflows();
  }, [reloadWorkflows]);

  async function loadWorkflowDetail(id: string) {
    try {
      const wf = await getWorkflow(id);
      setSelected(wf);
      const log = await getAuditLog(id);
      setAudit(log);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load workflow detail");
    }
  }

  // ---- Mutations ----

  async function handleCreate(args: {
    document_title: string;
    document_type?: string;
    starting_state: string;
  }) {
    try {
      const wf = await createWorkflow({
        project_id: projectId,
        pms_class_id: pmsClassId,
        ...args,
      });
      toast.success(`Workflow created at ${wf.current_state}`);
      setCreateOpen(false);
      await reloadWorkflows();
    } catch (e: any) {
      toast.error(e?.message || "Create failed");
    }
  }

  async function handleTransition(args: {
    target_state: string;
    is_rfq: boolean;
    change_identifiers: { identifier_code?: string; description: string }[];
  }) {
    if (!selected) return;
    try {
      await transitionWorkflow(selected.id, args);
      toast.success(`Transitioned to ${args.target_state}`);
      setTransitionOpen(false);
      await loadWorkflowDetail(selected.id);
    } catch (e: any) {
      toast.error(e?.message || "Transition failed");
    }
  }

  async function handleSign(signatureType: string) {
    if (!signRev) return;
    try {
      await signRevision(signRev.id, { signature_type: signatureType });
      toast.success(`Signed as ${signatureType}`);
      setSignOpen(false);
      setSignRev(null);
      if (selected) await loadWorkflowDetail(selected.id);
    } catch (e: any) {
      toast.error(e?.message || "Sign failed");
    }
  }

  async function handleVoid() {
    if (!selected) return;
    if (!window.confirm("Permanently void this workflow? This cannot be undone."))
      return;
    try {
      await voidWorkflow(selected.id);
      toast.success("Workflow voided");
      await loadWorkflowDetail(selected.id);
    } catch (e: any) {
      toast.error(e?.message || "Void failed");
    }
  }

  async function handleIssueInfo() {
    if (!selected) return;
    try {
      await issueInfo(selected.id);
      toast.success("Branched to P1 (Issued for Information)");
      await loadWorkflowDetail(selected.id);
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    }
  }

  // Allowed transitions for current selected workflow
  const allowedTargets = useMemo(() => {
    if (!selected || !stateMachine) return [] as string[];
    return stateMachine.transitions[selected.current_state] || [];
  }, [selected, stateMachine]);

  // Which signatures are still missing on the CURRENT revision?
  // Used to block "Issue Next Revision" when prior isn't fully signed.
  const currentRevMissingSigs = useMemo<string[]>(() => {
    if (!selected || !stateMachine || !selected.current_revision_id) return [];
    const cur = selected.revisions.find(
      (r) => r.id === selected.current_revision_id,
    );
    if (!cur) return [];
    const required =
      stateMachine.signatures_required[cur.code]?.[
        cur.is_rfq ? "rfq" : "non_rfq"
      ] || [];
    const present = new Set(
      cur.signatures.filter((s) => !s.revoked).map((s) => s.signature_type),
    );
    return required.filter((r) => !present.has(r));
  }, [selected, stateMachine]);

  const currentRevFullySigned = currentRevMissingSigs.length === 0;

  return (
    <div className="flex flex-col">
      <div className="container mx-auto p-6 space-y-6">
        {/* Title + role banner */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              Document Revision Workflow
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage engineering document revisions per SPE Section 2.5. Pick a
              project and PMS class to begin.
            </p>
          </div>
          {user && (
            <div className="text-xs rounded-md border bg-muted/50 px-3 py-2">
              <div>
                <span className="text-muted-foreground">Logged in as:</span>{" "}
                <span className="font-medium">{user.full_name || user.email}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Role:</span>{" "}
                <Badge variant="secondary" className="font-mono">
                  {myRole || "—"}
                </Badge>
                {myAllowedSigs.size > 0 && (
                  <span className="ml-2 text-muted-foreground">
                    can sign: {[...myAllowedSigs].join(", ")}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Role-mismatch banner — they're logged in but not as a revision role */}
        {user && myAllowedSigs.size === 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <div>
                <div className="font-medium">
                  Read-only mode — no revision role
                </div>
                <div className="mt-1 text-xs">
                  Your role <span className="font-mono">{myRole || "(none)"}</span>{" "}
                  isn't one of MAKER / CHECKER / APPROVER, so you can browse but
                  cannot sign, transition, or void. Ask an admin to assign you a
                  role to take action.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: select project & PMS */}
        <Card>
          <CardHeader>
            <CardTitle>1. Select Project &amp; PMS Class</CardTitle>
            <CardDescription>
              Each project/PMS combination has its own independent revision
              lifecycle.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Select
                  value={projectId}
                  onValueChange={setProjectId}
                  disabled={mastersLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        mastersLoading
                          ? "Loading projects..."
                          : projects.length === 0
                          ? "No projects found"
                          : "Select a project"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.project_id} value={p.project_id}>
                        <span className="font-medium">{p.project_name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({p.client_name})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>PMS Class</Label>
                <Select
                  value={pmsClassId}
                  onValueChange={setPmsClassId}
                  disabled={mastersLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        mastersLoading
                          ? "Loading PMS classes..."
                          : pmsClasses.length === 0
                          ? "No PMS classes found"
                          : "Select a PMS class"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {pmsClasses.map((c) => (
                      <SelectItem key={c.piping_class} value={c.piping_class}>
                        <span className="font-medium">{c.piping_class}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {c.rating} · {c.material}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 2: workflows under that combo */}
        {projectId && pmsClassId && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>2. Workflow</CardTitle>
                <CardDescription>
                  {workflows.length === 0
                    ? "No workflow yet for this combination — create one to begin."
                    : `${workflows.length} workflow${workflows.length === 1 ? "" : "s"} found.`}
                </CardDescription>
              </div>
              {workflows.length === 0 && canIssueOrCreate && (
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <FilePlus2 className="w-4 h-4 mr-2" />
                      Create Workflow
                    </Button>
                  </DialogTrigger>
                  <CreateWorkflowDialog onCreate={handleCreate} />
                </Dialog>
              )}
              {workflows.length === 0 && !canIssueOrCreate && (
                <span className="text-xs text-muted-foreground">
                  Only Maker or Approver can create a workflow.
                </span>
              )}
            </CardHeader>
            {loading && (
              <CardContent>
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </CardContent>
            )}
          </Card>
        )}

        {/* Step 3: workflow detail */}
        {selected && stateMachine && (
          <>
            {/* Header card */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{selected.document_title}</CardTitle>
                    <CardDescription className="mt-1 flex flex-wrap gap-2 text-xs">
                      <span>{selected.document_type || "Document"}</span>
                      <span>•</span>
                      <span>{selected.project_id}</span>
                      <span>•</span>
                      <span>{selected.pms_class_id}</span>
                      <span>•</span>
                      <span>created {fmt(selected.created_at)}</span>
                    </CardDescription>
                  </div>
                  <StatePhaseBadge
                    state={selected.current_state}
                    phase={selected.current_phase}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {selected.is_locked ? (
                    <Badge variant="destructive" className="gap-1">
                      <Lock className="w-3 h-3" /> Locked (XX)
                    </Badge>
                  ) : (
                    <>
                      {canIssueOrCreate && (
                        <Dialog
                          open={transitionOpen}
                          onOpenChange={setTransitionOpen}
                        >
                          <DialogTrigger asChild>
                            <Button disabled={!currentRevFullySigned}>
                              <Send className="w-4 h-4 mr-2" />
                              Issue Next Revision
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
                      {canIssueOrCreate && (
                        <Button variant="outline" onClick={handleIssueInfo}>
                          Issue for Information (P1)
                        </Button>
                      )}
                      {canVoid && (
                        <Button variant="destructive" onClick={handleVoid}>
                          Void (XX)
                        </Button>
                      )}
                      {!canIssueOrCreate && !canVoid && (
                        <span className="text-xs text-muted-foreground">
                          You can browse this workflow but cannot transition or
                          void it. Sign-only access (Checker).
                        </span>
                      )}
                    </>
                  )}
                </div>
                {!selected.is_locked && !currentRevFullySigned && (
                  <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5" />
                    <div>
                      <span className="font-medium">
                        Sign-off required before next revision.
                      </span>{" "}
                      Current revision still needs:&nbsp;
                      <span className="font-mono">
                        {currentRevMissingSigs.join(", ")}
                      </span>
                      . You can still issue P1 (info) or void (XX) without
                      these.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Revisions table */}
            <Card>
              <CardHeader>
                <CardTitle>Revisions</CardTitle>
                <CardDescription>
                  All revisions issued for this workflow. Greyed-out rows have
                  been removed from the document history (IDC strip / AFC
                  strip).
                </CardDescription>
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
                    {[...selected.revisions]
                      .sort(
                        (a, b) =>
                          new Date(b.issued_at).getTime() -
                          new Date(a.issued_at).getTime(),
                      )
                      .map((rev) => {
                        const required =
                          stateMachine.signatures_required[rev.code]?.[
                            rev.is_rfq ? "rfq" : "non_rfq"
                          ] || [];
                        const present = new Set(
                          rev.signatures
                            .filter((s) => !s.revoked)
                            .map((s) => s.signature_type),
                        );
                        const stale = !rev.included_in_history;
                        const isInfoBranch = rev.code === "P1";
                        const parent = rev.parent_revision_id
                          ? selected.revisions.find(
                              (r) => r.id === rev.parent_revision_id,
                            )
                          : null;
                        return (
                          <TableRow
                            key={rev.id}
                            className={[
                              stale ? "opacity-50" : "",
                              isInfoBranch ? "bg-amber-50/40" : "",
                            ].join(" ")}
                          >
                            <TableCell className="font-mono font-semibold">
                              {rev.revision_label}
                              {rev.is_rfq && (
                                <Badge
                                  variant="outline"
                                  className="ml-2 text-xs"
                                >
                                  RFQ
                                </Badge>
                              )}
                              {isInfoBranch && (
                                <Badge
                                  variant="outline"
                                  className="ml-2 text-xs border-amber-400 text-amber-800"
                                >
                                  info-only
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {rev.code}
                              {isInfoBranch && parent && (
                                <span className="ml-1 text-[10px]">
                                  (from {parent.revision_label})
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  rev.status === "SIGNED"
                                    ? "default"
                                    : rev.status === "VOIDED"
                                    ? "destructive"
                                    : "secondary"
                                }
                              >
                                {rev.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {fmt(rev.issued_at)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {required.map((sig) => (
                                  <Badge
                                    key={sig}
                                    variant={
                                      present.has(sig) ? "default" : "outline"
                                    }
                                    className="text-xs"
                                  >
                                    {sig.charAt(0)}
                                    {present.has(sig) ? "✓" : ""}
                                  </Badge>
                                ))}
                                {required.length === 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {!selected.is_locked &&
                                rev.status !== "SUPERSEDED" &&
                                required.some(
                                  (r) =>
                                    !present.has(r) && myAllowedSigs.has(r),
                                ) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSignRev(rev);
                                      setSignOpen(true);
                                    }}
                                  >
                                    Sign
                                  </Button>
                                )}
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
              <CardHeader>
                <CardTitle>Audit Log</CardTitle>
                <CardDescription>
                  Every state change and signature is recorded.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>From → To</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {fmt(e.performed_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {e.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {e.from_state || "—"} → {e.to_state || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {e.actor || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {e.extra_metadata
                            ? JSON.stringify(e.extra_metadata)
                            : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Sign dialog */}
            <Dialog
              open={signOpen}
              onOpenChange={(o) => {
                setSignOpen(o);
                if (!o) setSignRev(null);
              }}
            >
              {signRev && stateMachine && (
                <SignDialog
                  revision={signRev}
                  required={
                    stateMachine.signatures_required[signRev.code]?.[
                      signRev.is_rfq ? "rfq" : "non_rfq"
                    ] || []
                  }
                  myAllowedSigs={myAllowedSigs}
                  onSubmit={handleSign}
                />
              )}
            </Dialog>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Subcomponents
// ============================================================

function CreateWorkflowDialog({
  onCreate,
}: {
  onCreate: (args: {
    document_title: string;
    document_type?: string;
    starting_state: string;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("SPEC");
  const [start, setStart] = useState("A0");
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create Workflow</DialogTitle>
        <DialogDescription>
          Issues the first revision in the chosen starting state.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Document Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Piping Material Specification — Class A1A"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Document Type</Label>
            <Input
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="SPEC / DRG / DSH"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Starting State</Label>
            <Select value={start} onValueChange={setStart}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["A0", "R0", "A1", "C0", "C1", "D0", "00", "Z1", "P1"].map(
                  (s) => (
                    <SelectItem key={s} value={s}>
                      {STATE_LABELS[s] || s}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!title.trim()}
          onClick={() =>
            onCreate({
              document_title: title.trim(),
              document_type: type.trim() || undefined,
              starting_state: start,
            })
          }
        >
          <Plus className="w-4 h-4 mr-2" />
          Create
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function TransitionDialog({
  allowedTargets,
  currentState,
  stateMachine,
  onSubmit,
}: {
  allowedTargets: string[];
  currentState: string;
  stateMachine: StateMachineInfo;
  onSubmit: (args: {
    target_state: string;
    is_rfq: boolean;
    change_identifiers: { identifier_code?: string; description: string }[];
  }) => void;
}) {
  const [target, setTarget] = useState<string>(allowedTargets[0] || "");
  const [isRfq, setIsRfq] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [changeCode, setChangeCode] = useState("");

  // Same-state target = looping = change identifier required
  const looping = target === currentState;

  const required = stateMachine.signatures_required[target]?.[
    isRfq ? "rfq" : "non_rfq"
  ] || [];

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Issue Next Revision</DialogTitle>
        <DialogDescription>
          Currently at <span className="font-mono">{currentState}</span>. Pick
          where to move.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Target State</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedTargets.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATE_LABELS[s] || s}
                  {s === currentState && " (loop)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {target === "A1" && (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 p-3">
            <Checkbox
              id="rfq"
              checked={isRfq}
              onCheckedChange={(v) => setIsRfq(Boolean(v))}
            />
            <Label htmlFor="rfq" className="cursor-pointer">
              Issued as RFQ (forces Approved signature)
            </Label>
          </div>
        )}

        {looping && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span className="font-medium">
                Change identifier required for series loop
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label className="text-xs">Code (optional)</Label>
                <Input
                  value={changeCode}
                  onChange={(e) => setChangeCode(e.target.value)}
                  placeholder="e.g. CH-01"
                />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  placeholder="What changed since last revision?"
                />
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground flex items-start gap-2">
          <Info className="w-3 h-3 mt-0.5" />
          Signatures required after issue:&nbsp;
          <span className="font-medium">
            {required.length > 0 ? required.join(", ") : "none"}
          </span>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!target || (looping && !changeNote.trim())}
          onClick={() =>
            onSubmit({
              target_state: target,
              is_rfq: isRfq,
              change_identifiers: looping
                ? [
                    {
                      identifier_code: changeCode.trim() || undefined,
                      description: changeNote.trim(),
                    },
                  ]
                : [],
            })
          }
        >
          Issue {target}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SignDialog({
  revision,
  required,
  myAllowedSigs,
  onSubmit,
}: {
  revision: Revision;
  required: string[];
  myAllowedSigs: Set<string>;
  onSubmit: (signatureType: string) => void;
}) {
  const present = new Set(
    revision.signatures.filter((s) => !s.revoked).map((s) => s.signature_type),
  );
  // Only offer signature types that are: required, not yet signed, AND
  // permitted by the current user's role.
  const remaining = required.filter(
    (r) => !present.has(r) && myAllowedSigs.has(r),
  );
  const [type, setType] = useState(remaining[0] || "");
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Sign Revision {revision.revision_label}</DialogTitle>
        <DialogDescription>
          You will sign as the currently logged-in user. Backend enforces that
          your role permits the chosen signature type and that you have not
          already signed another slot on this revision.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        {remaining.length === 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Nothing to sign here. Either every required signature is already
            applied, or none of them is one your role can sign.
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Signature Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {remaining.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          Required signatures for this revision: {required.join(", ") || "none"}.
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!type || remaining.length === 0}
          onClick={() => onSubmit(type)}
        >
          Sign as {type}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
