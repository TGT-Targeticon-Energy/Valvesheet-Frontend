/**
 * SaveToWorkflowButton — Hooks an AI-generated datasheet into the
 * Generate Valvesheet system (route: /valvesheet-workflow). Clicking it:
 *
 *   1. If a workflow already exists for (project, vdsCode) — opens it.
 *   2. Otherwise creates a fresh A0 revision with the AI-generated
 *      datasheet pre-populated, then opens that workflow.
 *
 * Used inline on every DatasheetCard rendered by the chat agent.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, FileCheck2, GitMerge, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { vswApi, type ProjectMasterEntry, type VswWorkflow } from "@/services/vswApi";

interface Props {
  vdsCode: string;
  data: Record<string, string>;
}

export function SaveToWorkflowButton({ vdsCode, data }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectMasterEntry[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [existing, setExisting] = useState<VswWorkflow | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Explicit loading + error states so the Select can show the right
  // message instead of an infinite "Loading projects…" if the fetch
  // returns an empty list or fails.
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  async function loadProjects() {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const rows = await vswApi.listProjects();
      setProjects(rows || []);
    } catch (e: any) {
      setProjects([]);
      // Hint at the most common cause — the user's JWT expired so the
      // backend rejected the request. The UI shows the message inline.
      const raw = e?.message || "Could not load projects";
      const friendly = /401|403|unauthor/i.test(raw)
        ? "Not authorized — your session may have expired. Sign in again, then re-open this dialog."
        : raw;
      setProjectsError(friendly);
    } finally {
      setProjectsLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void loadProjects();
  }, [open]);

  // When the user picks a project, see if a workflow already exists for
  // this (project, VDS) pair so we can offer "Open existing" instead.
  useEffect(() => {
    if (!projectId || !vdsCode) { setExisting(null); return; }
    let cancelled = false;
    setChecking(true);
    vswApi.listWorkflows({ project_id: projectId, vds_number: vdsCode })
      .then((rows) => { if (!cancelled) setExisting(rows && rows[0] || null); })
      .catch(() => { if (!cancelled) setExisting(null); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [projectId, vdsCode]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.project_id === projectId),
    [projects, projectId],
  );

  const documentTitle = useMemo(() => {
    const desc = data.valve_type || "Valve Datasheet";
    return selectedProject
      ? `${desc} — ${vdsCode} (${selectedProject.project_name})`
      : `${desc} — ${vdsCode}`;
  }, [data.valve_type, vdsCode, selectedProject]);

  // Strip values like "-" / "" so the workflow snapshot is clean.
  const datasheet_json = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined || v === null) continue;
      const s = typeof v === "string" ? v.trim() : v;
      if (s === "" || s === "-") continue;
      out[k] = s;
    }
    // vsw_no field used by the backend xlsx writer
    if (!out.vds_no) out.vds_no = vdsCode;
    return out;
  }, [data, vdsCode]);

  async function handleCreate() {
    if (!projectId) return;
    setSubmitting(true);
    try {
      const r = await vswApi.createWorkflow({
        project_id: projectId,
        vds_number: vdsCode,
        valve_type: data.valve_type || undefined,
        piping_class: data.piping_class || undefined,
        document_title: documentTitle,
        starting_state: "A0",
        datasheet_json,
      });
      toast.success(`Workflow created at A0 (${r.label})`);
      setOpen(false);
      navigate(`/valvesheet-workflow/${r.workflow_id}`);
    } catch (e: any) {
      toast.error(e.message || "Could not create workflow");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenExisting() {
    if (!existing) return;
    setOpen(false);
    navigate(`/valvesheet-workflow/${existing.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
          title="Save this VDS to Generate Valvesheet so it can be signed off"
        >
          <GitMerge className="w-3.5 h-3.5" />
          Save to Workflow
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save {vdsCode} to Generate Valvesheet</DialogTitle>
          <DialogDescription>
            Picks a project, then creates a fresh <span className="font-mono">A0</span> revision
            with the AI-generated datasheet attached. If a workflow already
            exists for this (project, VDS), opens it instead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Project *</Label>
            <Select value={projectId} onValueChange={setProjectId} disabled={projectsLoading || projects.length === 0}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    projectsLoading
                      ? "Loading projects…"
                      : projectsError
                        ? "Couldn't load projects"
                        : projects.length === 0
                          ? "No projects available"
                          : "Select a project"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.project_id} value={p.project_id}>
                    <span className="font-medium">{p.project_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {p.project_id}{p.sap_project_code ? ` · ${p.sap_project_code}` : ""}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projectsLoading && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Fetching project master…
              </div>
            )}
            {projectsError && !projectsLoading && (
              <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div>{projectsError}</div>
                  <button
                    type="button"
                    onClick={() => void loadProjects()}
                    className="mt-1 underline text-red-900 hover:text-red-700"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
            {!projectsLoading && !projectsError && projects.length === 0 && (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  No active projects found. Ask an admin to create one in the
                  Project Master page, then re-open this dialog.
                </span>
              </div>
            )}
          </div>

          {existing && (
            <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-xs text-blue-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <div>
                <div className="font-medium">
                  A workflow for <span className="font-mono">{vdsCode}</span> already
                  exists in this project.
                </div>
                <div className="mt-1">
                  Currently at <span className="font-mono">{existing.current_state}</span>{" · "}
                  <span className="font-mono">{existing.current_phase}</span>.
                  Re-creating isn't allowed (uniqueness rule).
                </div>
              </div>
            </div>
          )}

          {checking && !existing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Checking for an
              existing workflow…
            </div>
          )}

          {selectedProject && !existing && !checking && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <div className="font-medium">{documentTitle}</div>
              <div className="text-muted-foreground mt-1">
                {Object.keys(datasheet_json).length} field{Object.keys(datasheet_json).length === 1 ? "" : "s"} captured from the AI output
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {existing ? (
            <Button onClick={handleOpenExisting}>
              <FileCheck2 className="w-4 h-4 mr-2" />
              Open existing workflow
            </Button>
          ) : (
            <Button disabled={!projectId || submitting} onClick={handleCreate}>
              {submitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</>
              ) : (
                <><GitMerge className="w-4 h-4 mr-2" />Create A0 revision</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
