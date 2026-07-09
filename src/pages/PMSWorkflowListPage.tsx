/**
 * Generate PMS Datasheet — list page.
 *
 * Top toolbar: New PMS Workflow + Refresh.
 * Body: project + piping-class filters, table of all workflows. Click
 * a row → /pms-workflow/<id>.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, Eye } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import {
  pmsWorkflowApi, type PmsWorkflow, projectApi, type ProjectMasterEntry,
} from "@/services/pmsWorkflowApi";
import { fmt } from "./pmsWorkflow/shared";

export default function PMSWorkflowListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = ((user as any)?.role_code || "").toUpperCase();

  const [projects, setProjects] = useState<ProjectMasterEntry[]>([]);
  const [workflows, setWorkflows] = useState<PmsWorkflow[]>([]);
  const [filterProject, setFilterProject] = useState<string>("");
  const [filterClass, setFilterClass] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const projectName = useCallback((id: string) => {
    const p = projects.find(x => x.project_id === id);
    return p ? `${p.project_name} (${p.project_id})` : id;
  }, [projects]);

  useEffect(() => {
    projectApi.listProjects()
      .then(setProjects)
      .catch((e) => toast.error("Could not load projects: " + e.message));
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (filterProject.trim()) filters.project_id = filterProject.trim();
      if (filterClass.trim()) filters.piping_class = filterClass.trim();
      const list = await pmsWorkflowApi.listWorkflows(filters);
      setWorkflows(list);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterProject, filterClass]);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <div className="flex flex-col p-6 space-y-4 container mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">PMS Revision</h1>
          <p className="text-sm text-muted-foreground">
            Per (project, piping-class) document lifecycle with the same
            SPE Section 2.5 revisions and 4-signature approval used for
            valvesheets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <Badge variant="secondary" className="font-mono">
              {(user as any).full_name || (user as any).email} · {role || "—"}
            </Badge>
          )}
          <Button variant="outline" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>PMS Workflows</CardTitle>
          <CardDescription>
            Filter by project or piping class. Click a row to open detail.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Project</Label>
              <Select
                value={filterProject || "__all__"}
                onValueChange={(v) => setFilterProject(v === "__all__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={projects.length === 0 ? "Loading…" : "All projects"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.project_id} value={p.project_id}>
                      <span className="font-medium">{p.project_name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">({p.project_id})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Piping Class</Label>
              <Input
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                placeholder="e.g. A1"
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No PMS workflows. Create one to begin.
                  </TableCell>
                </TableRow>
              ) : workflows.map((w) => (
                <TableRow
                  key={w.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate(`/pms-workflow/${w.id}`)}
                >
                  <TableCell className="font-mono font-semibold">{w.piping_class}</TableCell>
                  <TableCell>{projectName(w.project_id)}</TableCell>
                  <TableCell><Badge className="font-mono">{w.current_state}</Badge></TableCell>
                  <TableCell className="text-xs">{w.current_phase}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fmt(w.updated_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/pms-workflow/${w.id}`);
                      }}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
