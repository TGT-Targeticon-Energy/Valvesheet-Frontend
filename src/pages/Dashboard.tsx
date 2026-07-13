/**
 * Dashboard — KPIs and recent activity from the unified Generate Valvesheet.
 *
 * Reads /api/vsw/workflows and surfaces:
 *   • Total workflows
 *   • Signed workflows  (current revision = SIGNED)
 *   • Pending workflows (everything that isn't SIGNED / VOIDED)
 *   • Recent activity sorted by updated_at — clicking a row jumps
 *     straight to that workflow in the Generate Valvesheet page.
 */
import { AppHeader } from "@/components/layout/AppHeader";
import { KPICard } from "@/components/dashboard/KPICard";
import { Panel } from "@/components/common/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileSpreadsheet, CheckCircle, Clock, Sparkles, FilePlus2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { vswApi, type VswWorkflow, type ProjectMasterEntry } from "@/services/vswApi";

const formatTimeAgo = (iso?: string): string => {
  if (!iso) return "Just now";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "Just now";
  const diffMs = Date.now() - t;
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

// Loose mapping: anything that's not actively done / dead is "pending".
const isSigned = (state: string) => state === "00" || state === "Z1";
const isVoided = (state: string) => state === "XX";

export default function Dashboard() {
  const [workflows, setWorkflows] = useState<VswWorkflow[]>([]);
  const [projects, setProjects] = useState<ProjectMasterEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [wfs, ps] = await Promise.all([
          vswApi.listWorkflows(),
          vswApi.listProjects().catch(() => []),
        ]);
        if (!mounted) return;
        setWorkflows(wfs || []);
        setProjects(ps || []);
      } catch {
        if (!mounted) return;
        setWorkflows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const projectName = useMemo(() => {
    const m = new Map(projects.map((p) => [p.project_id, p.project_name]));
    return (id: string) => m.get(id) || id;
  }, [projects]);

  const total = workflows.length;
  const signed = workflows.filter((w) => isSigned(w.current_state)).length;
  const voided = workflows.filter((w) => isVoided(w.current_state)).length;
  const pending = total - signed - voided;

  const recent = useMemo(() => {
    return [...workflows]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 12);
  }, [workflows]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title="Dashboard" breadcrumbs={[{ label: "Generate Valvesheet" }]} />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <KPICard
              title="Total Workflows"
              value={total}
              subtitle="Per (project, VDS) document"
              icon={FileSpreadsheet}
              variant="primary"
            />
            <KPICard
              title="Signed"
              value={signed}
              subtitle="AFC or As-Built revisions"
              icon={CheckCircle}
              variant="accent"
            />
            <KPICard
              title="Pending"
              value={pending}
              subtitle="In review / awaiting next signature"
              icon={Clock}
              variant="primary"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Panel
              title="Recent Activity"
              description="Latest revisions across all workflows"
              className="lg:col-span-2"
            >
              {loading ? (
                <div className="py-6 text-sm text-muted-foreground">Loading…</div>
              ) : recent.length === 0 ? (
                <div className="py-6 text-sm text-muted-foreground">
                  No workflows yet. Create one from the Generate Valvesheet
                  page or generate a datasheet with the Valve AI Agent.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recent.map((w) => (
                    <Link
                      key={w.id}
                      to={`/valvesheet-workflow/${w.id}`}
                      className="flex items-start justify-between gap-3 py-3 px-1 hover:bg-muted/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-sm">{w.vds_number}</span>
                          <Badge variant="outline" className="font-mono text-[10px]">{w.current_state}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{w.current_phase}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {projectName(w.project_id)}
                          {w.valve_type ? ` · ${w.valve_type}` : ""}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimeAgo(w.updated_at)}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>

            <div className="space-y-6">
              <Panel title="Quick Actions">
                <div className="space-y-2">
                  <Link to="/valvesheet-workflow" className="block">
                    <Button className="w-full justify-start gap-2 bg-accent hover:bg-accent/90" size="lg">
                      <FilePlus2 className="w-4 h-4" />
                      Open Generate Valvesheet
                    </Button>
                  </Link>
                  <Link to="/agent" className="block">
                    <Button variant="outline" className="w-full justify-start gap-2" size="lg">
                      <Sparkles className="w-4 h-4" />
                      Generate via Valve AI Agent
                    </Button>
                  </Link>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
