/**
 * Generate PMS Datasheet — create page.
 *
 * Flow:
 *  1. Pick a project.
 *  2. Pick a saved PMS class (loaded from /pms-classes — distinct classes
 *     from the saved_pms store, each carrying its rating / material / CA).
 *  3. Click "Create at A0".
 *
 * Service / design pressure / design temperature are revision-level fields
 * and are NOT shown here — the Maker edits them on the revision detail page.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Plus } from "lucide-react";

import {
  pmsWorkflowApi, projectApi,
  type ProjectMasterEntry, type PmsClassEntry,
} from "@/services/pmsWorkflowApi";

export default function PMSWorkflowCreatePage() {
  const navigate = useNavigate();

  const [projects, setProjects] = useState<ProjectMasterEntry[]>([]);
  const [savedClasses, setSavedClasses] = useState<PmsClassEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [projectId, setProjectId] = useState("");
  const [pipingClass, setPipingClass] = useState("");

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      projectApi.listProjects().then(setProjects).catch(() => setProjects([])),
      pmsWorkflowApi.listSavedClasses()
        .then(setSavedClasses)
        .catch(() => {
          toast.error("Could not load saved PMS classes.");
          setSavedClasses([]);
        }),
    ]).finally(() => setLoading(false));
  }, []);

  const selectedClass = useMemo(
    () => savedClasses.find(c => c.piping_class === pipingClass) ?? null,
    [savedClasses, pipingClass],
  );

  const canCreate = !!projectId && !!pipingClass && !creating;

  async function handleCreate() {
    if (!canCreate || !selectedClass) return;
    setCreating(true);
    try {
      const r = await pmsWorkflowApi.createWorkflow({
        project_id: projectId,
        piping_class: selectedClass.piping_class,
        rating: selectedClass.rating,
        material: selectedClass.material,
        corrosion_allowance: selectedClass.corrosion_allowance,
      });
      toast.success(`PMS workflow created (${r.label})`);
      navigate(`/pms-workflow/${r.workflow_id}`);
    } catch (e: any) {
      const msg = e.message || "Could not create workflow";
      if (/already exists/i.test(msg)) {
        toast.error("A PMS workflow for this project + class already exists.");
      } else {
        toast.error(msg);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col p-6 space-y-4 container mx-auto">
      {/* ── Top toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/pms-workflow")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">New PMS Workflow</h1>
            <p className="text-sm text-muted-foreground">
              Pick a project and a saved PMS class — the workflow is seeded
              from the stored datasheet. Service, design pressure and
              temperature can be set on each revision.
            </p>
          </div>
        </div>
        <Button disabled={!canCreate} onClick={handleCreate}>
          {creating ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</>
          ) : (
            <><Plus className="w-4 h-4 mr-2" />Create at A0</>
          )}
        </Button>
      </div>

      {/* ── Form card ── */}
      <Card>
        <CardHeader>
          <CardTitle>Workflow details</CardTitle>
          <CardDescription>
            Select the project and the saved PMS class. The snapshot is loaded
            directly from the PMS store — no re-generation needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          <div>
            <Label>Project *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={loading ? "Loading projects…" : "Select a project"}
                />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.project_id} value={p.project_id}>
                    <span className="font-medium">{p.project_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {p.project_id}
                      {p.sap_project_code ? ` · ${p.sap_project_code}` : ""}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>PMS Class *</Label>
            {loading ? (
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading saved classes…
              </div>
            ) : savedClasses.length === 0 ? (
              <p className="mt-1 text-sm text-amber-600">
                No saved PMS classes found. Generate and save a PMS datasheet
                first before creating a workflow.
              </p>
            ) : (
              <Select value={pipingClass} onValueChange={setPipingClass}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a PMS class" />
                </SelectTrigger>
                <SelectContent>
                  {savedClasses.map((c) => (
                    <SelectItem key={c.piping_class} value={c.piping_class}>
                      <span className="font-semibold">{c.piping_class}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.rating} · {c.material} · {c.corrosion_allowance}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Class detail badge — shown after selection */}
          {selectedClass && (
            <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm space-y-1">
              <p className="font-medium text-base">
                Class&nbsp;
                <span className="text-primary">{selectedClass.piping_class}</span>
              </p>
              <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">Rating: </span>
                  {selectedClass.rating}
                </span>
                <span>
                  <span className="font-medium text-foreground">Material: </span>
                  {selectedClass.material}
                </span>
                <span>
                  <span className="font-medium text-foreground">CA: </span>
                  {selectedClass.corrosion_allowance}
                </span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                Service, design pressure and temperature are editable on each
                revision — not locked at creation time.
              </p>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
