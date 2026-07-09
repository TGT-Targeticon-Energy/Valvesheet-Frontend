/**
 * Generate Valvesheet — list page.
 *
 * Action buttons live at the top:
 *   • New Valvesheet  → /valvesheet-workflow/new
 *   • Refresh         → reloads the list
 *
 * Below the toolbar: filters (Project + VDS) and a clickable table.
 * Clicking a row navigates to /valvesheet-workflow/<id>.
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
import { Plus, RefreshCw, Eye } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import {
  vswApi, type VswWorkflow, type ProjectMasterEntry,
} from "@/services/vswApi";
import { fmt } from "./valvesheet/shared";

export default function ValvesheetListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = ((user as any)?.role_code || "").toUpperCase();
  const canCreate = role === "MAKER" || role === "APPROVER";

  const [projects, setProjects] = useState<ProjectMasterEntry[]>([]);
  const [workflows, setWorkflows] = useState<VswWorkflow[]>([]);
  const [filterProject, setFilterProject] = useState<string>("");
  const [filterVds, setFilterVds] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const projectName = useCallback((id: string) => {
    const p = projects.find(x => x.project_id === id);
    return p ? `${p.project_name} (${p.project_id})` : id;
  }, [projects]);

  useEffect(() => {
    vswApi.listProjects()
      .then(setProjects)
      .catch((e) => toast.error("Could not load projects: " + e.message));
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (filterProject.trim()) filters.project_id = filterProject.trim();
      if (filterVds.trim()) filters.vds_number = filterVds.trim();
      const list = await vswApi.listWorkflows(filters);
      setWorkflows(list);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterProject, filterVds]);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <div className="flex flex-col p-6 space-y-4 container mx-auto">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Generate Valvesheet</h1>
          <p className="text-sm text-muted-foreground">
            Per-VDS document lifecycle with SPE Section 2.5 revisions and 4-signature approval.
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
          {canCreate && (
            <Button onClick={() => navigate("/valvesheet-workflow/new")}>
              <Plus className="w-4 h-4 mr-1" />
              New Valvesheet
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Valvesheets</CardTitle>
          <CardDescription>
            Filter by project or VDS number. Click a row to open its detail page.
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
              <Label>VDS Number</Label>
              <Input
                value={filterVds}
                onChange={(e) => setFilterVds(e.target.value)}
                placeholder="e.g. BLRTA1R"
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>VDS</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Valve Type</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No valvesheets. Create one to begin.
                  </TableCell>
                </TableRow>
              ) : workflows.map((w) => (
                <TableRow
                  key={w.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate(`/valvesheet-workflow/${w.id}`)}
                >
                  <TableCell className="font-mono font-semibold">{w.vds_number}</TableCell>
                  <TableCell>{projectName(w.project_id)}</TableCell>
                  <TableCell className="text-xs">{w.valve_type || "—"}</TableCell>
                  <TableCell><Badge className="font-mono">{w.current_state}</Badge></TableCell>
                  <TableCell className="text-xs">{w.current_phase}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fmt(w.updated_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/valvesheet-workflow/${w.id}`);
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
