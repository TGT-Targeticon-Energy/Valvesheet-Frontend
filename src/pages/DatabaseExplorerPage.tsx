/**
 * Database Explorer (hidden admin tool)
 *
 * Single page that surfaces every data table the frontend can reach. NOT
 * linked from the sidebar — accessible only by typing /database in the URL.
 * Restricted to Admin access level via the route guard in App.tsx.
 *
 * Each "table" is a registered fetcher that returns an array of objects.
 * The DataTable component then renders rows generically, with column
 * auto-detection from the first record.
 *
 * To add a new table:
 *   1. Add an entry to the TABLES array below with { key, label, source,
 *      description, fetcher }.
 *   2. Save. The new table appears in the left rail automatically.
 */

import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  RefreshCw,
  Search,
  AlertCircle,
  Eye,
  EyeOff,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { authService } from "@/services/authService";
import api from "@/services/api";
import pmsApi from "@/services/pmsApi";
import * as agentApi from "@/services/agentApi";

// ── Table registry ──────────────────────────────────────────────────
type TableDef = {
  key: string;
  label: string;
  source: string;     // backend the data lives on (badge)
  description: string;
  fetcher: () => Promise<unknown[]>;
};

const TABLES: TableDef[] = [
  // ─── User Management Backend ───
  {
    key: "users",
    label: "Users",
    source: "User Mgmt API",
    description:
      "All user accounts — emails, names, role codes, access levels, project assignments, active flag.",
    fetcher: async () => await authService.getAllUsers(),
  },
  {
    key: "roles",
    label: "Roles (FPSORole)",
    source: "User Mgmt API",
    description:
      "Role definitions and their permission flags (can_create_ds, can_approve_ds, can_view_cost, …).",
    fetcher: async () => await authService.getRoles(),
  },

  // ─── Valvesheet Backend ───
  {
    key: "valvesheets",
    label: "Valvesheets",
    source: "Valvesheet API",
    description:
      "Generated datasheet records — VDS number, status, project, submitter, design data, approval state.",
    fetcher: async () => {
      const r = await api.listValvesheets({ limit: 500 });
      return r.records as unknown as unknown[];
    },
  },
  {
    key: "vds_revisions",
    label: "VDS Revision Logs",
    source: "Valvesheet API",
    description:
      "Audit trail of revisions to each VDS — who changed what, when, comments.",
    fetcher: async () => {
      const r = await api.listVdsRevisionLogs({ limit: 1000 });
      return r.records as unknown as unknown[];
    },
  },
  {
    key: "downloads",
    label: "Downloads (Valvesheet)",
    source: "Valvesheet API",
    description:
      "Tracking log of every Excel/PDF download — VDS code, filename, timestamp, user.",
    fetcher: async () => {
      const r = await api.listDownloads({ limit: 500 });
      return (r as any).records ?? (r as unknown as unknown[]);
    },
  },

  // ─── Valve Agent (LLM) Backend ───
  {
    key: "agent_sessions",
    label: "Valve Agent Sessions",
    source: "Valve Agent API",
    description:
      "Chat sessions on /agent — session_id, last activity, message count, token usage.",
    fetcher: async () => await agentApi.listSessions(200),
  },

  // The old PMS Generator catalogue / cache / constants / branch-charts
  // explorer entries were removed when the PMS backend flow changed to
  // pms-generator-new. The new backend exposes options/all and
  // resolve-class on demand rather than a static catalogue, so there
  // isn't a meaningful "table" to surface here.
];

// ── Page ────────────────────────────────────────────────────────────
export default function DatabaseExplorerPage() {
  const [activeKey, setActiveKey] = useState<string>(TABLES[0].key);
  const [data, setData] = useState<unknown[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [showRaw, setShowRaw] = useState(false);

  const activeTable = TABLES.find((t) => t.key === activeKey) ?? TABLES[0];

  const load = async (table: TableDef) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const rows = await table.fetcher();
      setData(Array.isArray(rows) ? rows : [rows]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(activeTable);
    setFilter("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (!filter.trim()) return data;
    const q = filter.toLowerCase();
    return data.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [data, filter]);

  const columns = useMemo(() => deriveColumns(filteredRows), [filteredRows]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <div className="flex-1 flex flex-col px-6 py-4 gap-4">
        {/* ── Title ─── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Database className="w-6 h-6 text-amber-600" />
              Database Explorer
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Internal admin tool — browse tables across every backend the frontend talks to.
              Not linked from the sidebar; reachable via direct URL only.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(activeTable)}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRaw((v) => !v)}
              className="gap-2"
            >
              {showRaw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showRaw ? "Hide JSON" : "Raw JSON"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadJson(activeTable.key, filteredRows)}
              disabled={!data || data.length === 0}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
          {/* ── Left rail — table list ─── */}
          <aside className="border rounded-lg bg-card p-2 h-fit md:sticky md:top-4">
            <div className="text-xs font-semibold text-muted-foreground px-2 py-1.5 uppercase tracking-wide">
              Tables ({TABLES.length})
            </div>
            <ul className="space-y-0.5">
              {TABLES.map((t) => (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={() => setActiveKey(t.key)}
                    className={cn(
                      "w-full text-left px-2.5 py-2 rounded-md text-sm transition-colors",
                      activeKey === t.key
                        ? "bg-accent text-accent-foreground font-semibold"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{t.label}</span>
                    </div>
                    <div className="text-[10px] opacity-70 mt-0.5">{t.source}</div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* ── Right pane — table data ─── */}
          <main className="border rounded-lg bg-card p-4 min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate">{activeTable.label}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeTable.description}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">{activeTable.source}</Badge>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter (full-text search across all fields)"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {data === null
                  ? ""
                  : `${filteredRows.length}${filter ? ` of ${data.length}` : ""} ${
                      filteredRows.length === 1 ? "row" : "rows"
                    }`}
              </div>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Loading…
              </div>
            )}

            {error && (
              <div className="border border-red-200 bg-red-50 rounded-md p-3 text-sm text-red-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold">Failed to load</div>
                  <div className="text-xs mt-0.5 break-all">{error}</div>
                </div>
              </div>
            )}

            {!loading && !error && data !== null && (
              <>
                {showRaw ? (
                  <pre className="text-xs bg-slate-50 dark:bg-slate-900 p-3 rounded-md max-h-[60vh] overflow-auto border">
                    {JSON.stringify(filteredRows, null, 2)}
                  </pre>
                ) : (
                  <DataTable rows={filteredRows} columns={columns} />
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// ── Generic table renderer ──────────────────────────────────────────
function DataTable({
  rows,
  columns,
}: {
  rows: unknown[];
  columns: string[];
}) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground border-2 border-dashed rounded-md">
        No rows.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 sticky top-0">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="text-left px-3 py-2 font-semibold border-b whitespace-nowrap"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={cn("border-b", i % 2 === 0 ? "bg-background" : "bg-muted/10")}>
              {columns.map((c) => (
                <td key={c} className="px-3 py-1.5 align-top max-w-[280px]">
                  <CellValue value={(row as any)?.[c]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">—</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className={value ? "text-emerald-700 font-medium" : "text-muted-foreground"}>
        {value ? "true" : "false"}
      </span>
    );
  }
  if (typeof value === "number") {
    return <span className="font-mono">{value}</span>;
  }
  if (typeof value === "string") {
    if (value.length > 200) {
      return (
        <span title={value} className="block truncate">
          {value.slice(0, 200)}…
        </span>
      );
    }
    return <span className="break-words">{value}</span>;
  }
  // arrays / objects → compact JSON preview
  return (
    <details className="cursor-pointer">
      <summary className="text-amber-600 hover:underline">
        {Array.isArray(value) ? `[${value.length}]` : "{…}"}
      </summary>
      <pre className="text-[10px] bg-slate-50 dark:bg-slate-900 p-1.5 rounded mt-1 overflow-x-auto max-w-full">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

// Derive a stable column list from the first few rows.
// We union the keys of the first 20 rows so sparse / inconsistent records
// still surface every column, but we avoid scanning huge datasets.
function deriveColumns(rows: unknown[]): string[] {
  const seen = new Set<string>();
  rows.slice(0, 20).forEach((r) => {
    if (r && typeof r === "object" && !Array.isArray(r)) {
      Object.keys(r as Record<string, unknown>).forEach((k) => seen.add(k));
    }
  });
  return Array.from(seen);
}

// ── Export helpers ──────────────────────────────────────────────────
function downloadJson(name: string, rows: unknown[]) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
