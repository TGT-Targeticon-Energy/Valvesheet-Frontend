/**
 * Generate Valvesheet — create page.
 *
 * Action buttons at the top:
 *   • Back        → /valvesheet-workflow
 *   • Create / Open existing  (right side, depending on detection)
 *
 * Pick a project, type a VDS number, the page detects whether a
 * valvesheet already exists for that pair and either offers to open
 * the existing one, or to create a fresh A0 revision.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Loader2, AlertCircle, FileCheck2, Sparkles, Plus,
} from "lucide-react";

import legacyApi from "@/services/api";
import { getDatasheet } from "@/services/agentApi";
import {
  vswApi, type ProjectMasterEntry, type VswWorkflow,
} from "@/services/vswApi";
import { isLikelyCompleteVDS } from "./valvesheet/shared";

type Suggestion = {
  vds: string;
  source: "index" | "generated";
  description: string;
  is_complete: boolean;
};

export default function ValvesheetCreatePage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectMasterEntry[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [vdsNumber, setVdsNumber] = useState("");
  const [title, setTitle] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [creating, setCreating] = useState(false);
  const [existing, setExisting] = useState<VswWorkflow | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);

  // Load project master once
  useEffect(() => {
    setProjectsLoading(true);
    vswApi.listProjects()
      .then((rows) => setProjects(rows || []))
      .catch((e) => toast.error("Could not load projects: " + e.message))
      .finally(() => setProjectsLoading(false));
  }, []);

  const vdsValid = isLikelyCompleteVDS(vdsNumber);
  const selectedProject = projects.find(p => p.project_id === projectId);

  // Debounced VDS typeahead
  useEffect(() => {
    const q = vdsNumber.trim().toUpperCase();
    if (!q) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await legacyApi.getVdsSuggestions(q);
        setSuggestions(res.suggestions || []);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [vdsNumber]);

  const matchingSuggestion = useMemo(() => {
    const v = vdsNumber.trim().toUpperCase();
    return suggestions.find((s) => s.vds.toUpperCase() === v) || null;
  }, [suggestions, vdsNumber]);

  // Auto-fill title once project + valid VDS are both set
  useEffect(() => {
    if (selectedProject && vdsValid && !title.trim()) {
      const desc = matchingSuggestion?.description || "Valve Datasheet";
      setTitle(`${desc} — ${vdsNumber.trim().toUpperCase()} (${selectedProject.project_name})`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, vdsNumber, vdsValid, matchingSuggestion?.description]);

  // Check for an existing valvesheet for this (project, VDS) pair
  useEffect(() => {
    const vds = vdsNumber.trim().toUpperCase();
    if (!projectId || !vds) { setExisting(null); return; }
    let cancelled = false;
    setCheckingExisting(true);
    vswApi.listWorkflows({ project_id: projectId, vds_number: vds })
      .then((rows) => { if (!cancelled) setExisting(rows.length > 0 ? rows[0] : null); })
      .catch(() => { if (!cancelled) setExisting(null); })
      .finally(() => { if (!cancelled) setCheckingExisting(false); });
    return () => { cancelled = true; };
  }, [projectId, vdsNumber]);

  const canCreate =
    !existing && !!projectId && vdsValid && !!title.trim() && !creating;

  async function handleCreate() {
    if (!canCreate) return;
    setCreating(true);
    try {
      const vds = vdsNumber.trim().toUpperCase();
      let datasheet_json: Record<string, unknown> | undefined;
      let valveType: string | undefined;
      let pipingClass: string | undefined;
      let genError: string | null = null;

      try {
        const result = await getDatasheet(vds);
        const d: Record<string, unknown> = result.data ?? {};
        // Treat a response with zero meaningful keys as a failure so the
        // user is told upfront, instead of getting a workflow with an
        // empty datasheet that downloads as a logo-only xlsx.
        const keyCount = d ? Object.keys(d).filter(
          (k) => d[k] !== null && d[k] !== undefined && d[k] !== "" && d[k] !== "-"
        ).length : 0;
        if (keyCount < 5) {
          genError = `Datasheet engine returned only ${keyCount} fields for ${vds}. ` +
                     "Production VDS engine may not be fully seeded.";
        }
        datasheet_json = d;
        valveType = (d?.["valve_type"] as string) || matchingSuggestion?.description || undefined;
        pipingClass = (d?.["piping_class"] as string) || undefined;
      } catch (e: any) {
        datasheet_json = undefined;
        valveType = matchingSuggestion?.description;
        genError = e?.message || "Datasheet engine call failed.";
      }

      // Warn loudly so empty xlsx downloads stop being a mystery.
      if (genError) {
        const proceed = window.confirm(
          `${genError}\n\nIf you continue, the valvesheet will be created ` +
          `with no datasheet content (the xlsx will have the header but no fields). ` +
          `\n\nProceed anyway?`,
        );
        if (!proceed) { setCreating(false); return; }
        toast.warning(genError);
      }

      const r = await vswApi.createWorkflow({
        project_id: projectId,
        vds_number: vds,
        valve_type: valveType,
        piping_class: pipingClass,
        document_title: title.trim(),
        starting_state: "A0",
        datasheet_json,
      });
      const fieldCount = datasheet_json
        ? Object.keys(datasheet_json).filter((k) => (datasheet_json as any)[k]).length
        : 0;
      toast.success(`Valvesheet created (${r.label}) — ${fieldCount} field${fieldCount === 1 ? "" : "s"} populated`);
      navigate(`/valvesheet-workflow/${r.workflow_id}`);
    } catch (e: any) {
      toast.error(e.message || "Could not create valvesheet");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col p-6 space-y-4 container mx-auto">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/valvesheet-workflow")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">New Valvesheet</h1>
            <p className="text-sm text-muted-foreground">
              Start a fresh A0 revision (Inter-Discipline Check) — per SPE Section 2.5.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {existing ? (
            <Button onClick={() => navigate(`/valvesheet-workflow/${existing.id}`)}>
              <FileCheck2 className="w-4 h-4 mr-2" />
              Open existing valvesheet
            </Button>
          ) : (
            <Button disabled={!canCreate} onClick={handleCreate}>
              {creating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</>
              ) : (
                <><Plus className="w-4 h-4 mr-2" />Create at A0</>
              )}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Valvesheet details</CardTitle>
          <CardDescription>
            Pick a project, type a VDS number — everything else (valve type,
            piping class, datasheet content) is decoded from the VDS code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Project *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder={projectsLoading ? "Loading projects…" : "Select a project"} />
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
          </div>

          <div>
            <Label>VDS Number *</Label>
            <div className="relative">
              <Input
                value={vdsNumber}
                onChange={(e) => { setVdsNumber(e.target.value.toUpperCase()); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="e.g. BLRTA1R"
                className="font-mono"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 rounded-md border bg-popover shadow-md max-h-60 overflow-y-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s.vds}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center justify-between"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setVdsNumber(s.vds);
                        setShowSuggestions(false);
                      }}
                    >
                      <span className="font-mono">{s.vds}</span>
                      <span className="text-muted-foreground ml-2 truncate">
                        {s.description}
                        {s.source === "index" && <span className="ml-1 text-[10px] uppercase">indexed</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {vdsNumber && !vdsValid && (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
                <span>
                  VDS code looks incomplete. Expected pattern:&nbsp;
                  <span className="font-mono">{`{prefix}{bore}{seat}{class}{end}`}</span>
                  &nbsp;e.g. <span className="font-mono">BLRTA1R</span>.
                  Keep typing or pick from the suggestions.
                </span>
              </div>
            )}
            {vdsValid && matchingSuggestion && (
              <div className="mt-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs text-foreground flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-medium">{matchingSuggestion.description}</span>
                {matchingSuggestion.source === "index" && (
                  <span className="ml-1 text-[10px] uppercase text-muted-foreground">indexed</span>
                )}
              </div>
            )}
          </div>

          {existing && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <div>
                <div className="font-medium">
                  A valvesheet already exists for{" "}
                  <span className="font-mono">{existing.vds_number}</span> in this project.
                </div>
                <div className="mt-1">
                  Currently at state{" "}
                  <span className="font-mono">{existing.current_state}</span>
                  {" · "}phase{" "}
                  <span className="font-mono">{existing.current_phase}</span>.
                  Re-issuing the same VDS isn't allowed (uniqueness rule).
                  Use the button at the top to open it.
                </div>
              </div>
            </div>
          )}
          {checkingExisting && !existing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Checking for an existing valvesheet…
            </div>
          )}

          <div>
            <Label>Document Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-fills once VDS is decoded"
              disabled={!!existing}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
