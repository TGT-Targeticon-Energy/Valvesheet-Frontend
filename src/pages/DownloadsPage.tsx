import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  Loader2,
  FolderOpen,
  Search,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ExcelJS from "exceljs";
import api, {
  type DownloadFileMetadata,
  type VDSRevisionLogEntry,
  type ValvesheetRecord,
} from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { canReviewApprovals, getRoleCode, isCreatorRole } from "@/lib/roles";

type FilterType = "all" | "xlsx";
type DownloadRow = {
  id: string;
  vds_number: string;
  piping_class: string;
  project_name: string;
  project_code: string;
  phase: string;
  revision_code: string;
  status: ValvesheetRecord["status"];
  requires_revision: boolean;
  reviewer_comment?: string | null;
  updated_at: string;
  latest_download_id?: string | null;
  latest_filename?: string | null;
  file_type?: string | null;
};

const ALLOWED_PROJECT_CODES = new Set(["20171", "20187", "20240801"]);

function inferRevisionCode(filename?: string | null): string {
  const name = String(filename || "").trim();
  if (!name) return "";
  const match = /_((?:R\d+)|(?:A\d+)|(?:C\d+)|(?:P\d+)|(?:Z\d+)|(?:XX)|(?:\d{2}))(?:_DRAFT)?\.xlsx$/i.exec(name);
  return match ? match[1].toUpperCase() : "";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function projectKeyFromLog(log: VDSRevisionLogEntry): string {
  const id = String(log.project_id || "").trim();
  const code = String(log.project_code || "").trim().toLowerCase();
  const name = String(log.project_name || "").trim().toLowerCase();
  if (id) return `id:${id}`;
  if (code) return `code:${code}`;
  if (name) return `name:${name}`;
  return "project:unknown";
}

function scopeKeyFromLog(log: VDSRevisionLogEntry): string {
  const projectKey = projectKeyFromLog(log);
  const phase = String(log.phase || "").trim().toLowerCase() || "unknown";
  return `${log.vds_number}::${projectKey}::${phase}`;
}

function resolveDownloadForLog(
  log: VDSRevisionLogEntry,
  downloads: DownloadFileMetadata[]
): DownloadFileMetadata | undefined {
  const candidates = downloads
    .filter((download) => download.vds_number === log.vds_number)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (candidates.length === 0) return undefined;

  const explicitFilename = String(log.excel_filename || "").trim();
  if (explicitFilename) {
    const exactMatch = candidates
      .find((download) => download.original_filename === explicitFilename);
    if (exactMatch) return exactMatch;

    const normalizedExplicit = explicitFilename.replace(/_DRAFT(?=\.xlsx$)/i, "");
    const normalizedMatch = candidates.find(
      (download) => download.original_filename.replace(/_DRAFT(?=\.xlsx$)/i, "") === normalizedExplicit
    );
    if (normalizedMatch) return normalizedMatch;
  }

  const optionShort = String(log.option_short || "").trim();
  const revisionCode = String(log.revision_code || "").trim();
  if (optionShort && revisionCode) {
    const projectRefs = [
      String(log.project_code || "").trim(),
      String(log.project_id || "").trim(),
      "NO_PROJECT",
    ].filter(Boolean);

    for (const projectRef of projectRefs) {
      const filenamePrefix = `${projectRef}_${log.vds_number}_${optionShort}_${revisionCode}`;
      const prefixMatch = candidates.find((download) =>
        download.original_filename.startsWith(filenamePrefix)
      );
      if (prefixMatch) return prefixMatch;
    }

    const tokenMatch = candidates.find((download) => {
      const filename = download.original_filename.toUpperCase();
      return (
        filename.includes(`_${String(log.vds_number).toUpperCase()}_`) &&
        filename.includes(`_${optionShort.toUpperCase()}_`) &&
        filename.includes(`_${revisionCode.toUpperCase()}`)
      );
    });
    if (tokenMatch) return tokenMatch;
  }

  if (revisionCode) {
    const revisionOnlyMatch = candidates.find((download) =>
      download.original_filename.toUpperCase().includes(`_${revisionCode.toUpperCase()}`)
    );
    if (revisionOnlyMatch) return revisionOnlyMatch;
  }

  return undefined;
}

function resolveDownloadForScope(
  latestLog: VDSRevisionLogEntry,
  scopeLogs: VDSRevisionLogEntry[],
  downloads: DownloadFileMetadata[]
): DownloadFileMetadata | undefined {
  const exactMetadataMatch = downloads
    .filter((download) => download.vds_number === latestLog.vds_number)
    .filter((download) => String(download.project_code || "").trim() === String(latestLog.project_code || "").trim())
    .filter((download) => String(download.phase || "").trim() === String(latestLog.phase || "").trim())
    .filter((download) => String(download.revision_code || "").trim() === String(latestLog.revision_code || "").trim())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  if (exactMetadataMatch) return exactMetadataMatch;

  const latestRevisionCode = String(latestLog.revision_code || "").trim();
  const sameRevisionLogs = latestRevisionCode
    ? scopeLogs
        .filter((entry) => String(entry.revision_code || "").trim() === latestRevisionCode)
        .sort(
          (a, b) =>
            new Date(b.updated_at || b.created_at).getTime() -
            new Date(a.updated_at || a.created_at).getTime()
        )
    : [];

  for (const entry of sameRevisionLogs) {
    const match = resolveDownloadForLog(entry, downloads);
    if (match) return match;
  }

  for (const entry of scopeLogs) {
    const match = resolveDownloadForLog(entry, downloads);
    if (match) return match;
  }

  return undefined;
}

function buildDownloadRows(
  records: ValvesheetRecord[],
  revisionLogs: VDSRevisionLogEntry[],
  downloads: DownloadFileMetadata[]
): DownloadRow[] {
  const recordsByVds = new Map(records.map((record) => [record.vds_number, record]));

  const logsByScope = new Map<string, VDSRevisionLogEntry[]>();
  revisionLogs.forEach((log) => {
    const scopeKey = scopeKeyFromLog(log);
    const existing = logsByScope.get(scopeKey) || [];
    existing.push(log);
    logsByScope.set(scopeKey, existing);
  });

  const scopedRows = Array.from(logsByScope.entries()).map(([, scopeLogs]) => {
    const sortedLogs = [...scopeLogs].sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime()
    );
    const latestLog = sortedLogs[0];
    const latestDownloadableLog =
      sortedLogs.find((entry) => Boolean(resolveDownloadForScope(entry, sortedLogs, downloads))) || latestLog;
    const record = recordsByVds.get(latestLog.vds_number);
    const matchingDownload = resolveDownloadForScope(latestDownloadableLog, sortedLogs, downloads);
    return {
      id: scopeKeyFromLog(latestDownloadableLog),
      vds_number: latestLog.vds_number,
      piping_class: record?.piping_class || "-",
      project_name: latestDownloadableLog.project_name || latestLog.project_name || record?.project_name || "-",
      project_code: latestDownloadableLog.project_code || latestLog.project_code || record?.project_code || "-",
      phase: String(latestDownloadableLog.phase || latestLog.phase || "").trim() || "unknown",
      revision_code: String(latestLog.revision_code || latestDownloadableLog.revision_code || "").trim(),
      status: (latestLog.status || record?.status || "pending") as ValvesheetRecord["status"],
      requires_revision: Boolean(record?.requires_revision),
      reviewer_comment: record?.reviewer_comment,
      updated_at:
        latestLog.updated_at || latestLog.created_at || record?.updated_at || record?.created_at || "",
      latest_download_id: matchingDownload?.id || null,
      latest_filename: matchingDownload?.original_filename || null,
      file_type: matchingDownload?.file_type || null,
    };
  }).filter((row) => Boolean(row.latest_download_id) && row.file_type === "xlsx");

  const scopedVdsSet = new Set(scopedRows.map((row) => row.vds_number));
  const fallbackRows = records
    .filter((record) => !scopedVdsSet.has(record.vds_number))
    .filter((record) => Boolean(record.latest_download_id) && record.file_type === "xlsx")
    .map((record) => ({
      id: record.id,
      vds_number: record.vds_number,
      piping_class: record.piping_class || "-",
      project_name: record.project_name || "-",
      project_code: record.project_code || "-",
      phase: "unknown",
      revision_code: "",
      status: record.status,
      requires_revision: record.requires_revision,
      reviewer_comment: record.reviewer_comment,
      updated_at: record.updated_at,
      latest_download_id: record.latest_download_id,
      latest_filename: record.latest_filename,
      file_type: record.file_type,
    }));

  return [...scopedRows, ...fallbackRows].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  ).filter((row) => ALLOWED_PROJECT_CODES.has(String(row.project_code || "").trim()));
}

export default function DownloadsPage() {
  const [rows, setRows] = useState<DownloadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchText, setSearchText] = useState("");
  const [selectedProjectFilter, setSelectedProjectFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, userRole } = useAuth();
  const roleCode = getRoleCode(userRole, user);
  const isReviewerView = canReviewApprovals(roleCode);
  const isEngineerView = isCreatorRole(roleCode);

  const fetchValvesheets = useCallback(async () => {
    setIsLoading(true);
    try {
      const [valvesheetRes, revisionLogRes, downloadRes] = await Promise.all([
        api.listValvesheets({ limit: 500 }),
        api.listVdsRevisionLogs({ limit: 2000 }),
        api.listDownloads({ file_type: "xlsx", limit: 2000 }),
      ]);
      const nextRows = buildDownloadRows(
        valvesheetRes.records,
        revisionLogRes.records,
        downloadRes.downloads
      );
      setRows(nextRows);
      setTotal(nextRows.length);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load generated valvesheets",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchValvesheets();
  }, [fetchValvesheets]);

  const handleDownloadByType = async (row: DownloadRow, fileType: "xlsx") => {
    if (!row.latest_download_id || row.file_type !== fileType) {
      toast({
        title: "File not available",
        description: `${fileType.toUpperCase()} file is not available for ${row.vds_number} (${row.project_name})`,
        variant: "destructive",
      });
      return;
    }

    const url = api.getDownloadUrl(row.latest_download_id);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      let latestApprovalRevisionCode = "";
      try {
        const revisionLogRes = await api.listVdsRevisionLogs({
          vds_number: row.vds_number,
          project_code: row.project_code || undefined,
          phase: row.phase && row.phase !== "unknown" ? row.phase : undefined,
          limit: 2000,
        });
        const latestScopedLog = revisionLogRes.records
          .filter((entry) => String(entry.project_code || "").trim() === String(row.project_code || "").trim())
          .filter((entry) =>
            row.phase && row.phase !== "unknown"
              ? String(entry.phase || "").trim() === String(row.phase || "").trim()
              : true
          )
          .sort(
            (a, b) =>
              new Date(b.updated_at || b.created_at).getTime() -
              new Date(a.updated_at || a.created_at).getTime()
          )[0];
        latestApprovalRevisionCode = String(latestScopedLog?.revision_code || "").trim();
      } catch {
        latestApprovalRevisionCode = "";
      }

      const blob = await response.blob();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await blob.arrayBuffer());
      const sheet = workbook.worksheets[0];
      const effectiveRevisionCode =
        latestApprovalRevisionCode || row.revision_code || inferRevisionCode(row.latest_filename);

      if (sheet) {
        sheet.getCell("D1").value = "Doc. No:";
        sheet.getCell("E1").value = "";
        sheet.getCell("D2").value = "Rev No:";
        sheet.getCell("E2").value = effectiveRevisionCode || "";
        sheet.getCell("A4").value = "VDS No";
        sheet.getCell("C4").value = row.vds_number || "";
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const patchedBlob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(patchedBlob);
      link.href = objectUrl;
      link.download = `${row.project_code || "NO_PROJECT"}_${row.vds_number || "NO_VDS"}_${effectiveRevisionCode || "NA"}.xlsx`;
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast({
        title: "Download failed",
        description: `Unable to prepare Excel for ${row.vds_number}.`,
        variant: "destructive",
      });
    }
  };

  const handleSendOrReview = async (row: DownloadRow) => {
    if (!row.vds_number) {
      toast({
        title: "Missing VDS Number",
        description: "Cannot proceed to review without a VDS number.",
        variant: "destructive",
      });
      return;
    }

    if (!isReviewerView && row.requires_revision) {
      navigate("/generator", {
        state: { vdsNumber: row.vds_number },
      });
      return;
    }

    toast({
      title: isReviewerView ? "Moved to Approval" : "Sent for Approval",
      description: isReviewerView
        ? `${row.vds_number} is ready for review`
        : `${row.vds_number} has been sent for review`,
    });
    if (isReviewerView) {
      navigate("/approval", {
        state: { vdsNumber: row.vds_number },
      });
      return;
    }

    if (isEngineerView) {
      await api.upsertValvesheet({
        vds_number: row.vds_number,
        status: "pending",
        requires_revision: false,
        reviewer_comment: "",
        author: user?.name || "Engineer",
        change_note: row.requires_revision
          ? "Updated after reviewer comments and resubmitted"
          : "Sent for approval",
      });
      await fetchValvesheets();
    }

    navigate("/approval", {
      state: { vdsNumber: row.vds_number },
    });
  };

  const filteredRows = useMemo(() => {
    const byProject = rows.filter((row) => {
      if (selectedProjectFilter === "all") return true;
      const projectKey = `${row.project_name || "-"}::${row.project_code || "-"}`;
      return projectKey === selectedProjectFilter;
    });

    const byType = byProject.filter((row) => {
      if (filter === "all") return true;
      return row.file_type === filter;
    });

    const q = searchText.trim().toLowerCase();
    if (!q) return byType;
    return byType.filter((row) =>
      row.vds_number.toLowerCase().includes(q) ||
      String(row.project_name || "").toLowerCase().includes(q) ||
      String(row.project_code || "").toLowerCase().includes(q)
    );
  }, [rows, filter, searchText, selectedProjectFilter]);

  const projectOptions = useMemo(() => {
    const entries = new Map<string, string>();
    rows.forEach((row) => {
      const key = `${row.project_name || "-"}::${row.project_code || "-"}`;
      if (entries.has(key)) return;
      const label =
        row.project_name && row.project_name !== "-" && row.project_code && row.project_code !== "-"
          ? `${row.project_name} (${row.project_code})`
          : row.project_name && row.project_name !== "-"
            ? row.project_name
            : row.project_code && row.project_code !== "-"
              ? row.project_code
              : "Unknown Project";
      entries.set(key, label);
    });
    return Array.from(entries.entries()).map(([value, label]) => ({ value, label }));
  }, [rows]);

  const filterButtons: { label: string; value: FilterType }[] = [
    { label: "All", value: "all" },
    { label: "XLSX", value: "xlsx" },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <AppHeader
        title="Generated Valvesheets"
        breadcrumbs={[
          { label: "FPSO Prosperity", href: "/" },
          { label: "Generated Valvesheets" },
        ]}
      />

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Download className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Generated Valvesheets</h2>
                <p className="text-sm text-muted-foreground">
                  {total} file{total !== 1 ? "s" : ""} stored
                </p>
              </div>
            </div>

            {/* Filter buttons */}
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              {filterButtons.map((fb) => (
                <Button
                  key={fb.value}
                  variant={filter === fb.value ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setFilter(fb.value)}
                >
                  {fb.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search by VDS no, project name, or project code"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 md:shrink-0">
              <label className="text-sm font-medium text-muted-foreground">
                Projects
              </label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm min-w-72 shadow-sm"
                value={selectedProjectFilter}
                onChange={(e) => setSelectedProjectFilter(e.target.value)}
              >
                <option value="all">All Projects</option>
                {projectOptions.map((project) => (
                  <option key={project.value} value={project.value}>
                    {project.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRows.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <FolderOpen className="w-12 h-12 text-muted-foreground/40 mb-4" />
                <p className="text-lg font-medium text-muted-foreground mb-1">
                  No generated valvesheets yet
                </p>
                <p className="text-sm text-muted-foreground/70">
                  Export a datasheet as PDF or XLSX to see it here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              {/* <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent Exports</CardTitle>
                <CardDescription>
                  Click download to re-download your generated valvesheet.
                </CardDescription>
              </CardHeader> */}
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr className="border-b">
                        <th className="text-left font-medium px-4 py-3 min-w-28">S. No.</th>
                        <th className="text-left font-medium px-4 py-3 min-w-36">VDS no.</th>
                        <th className="text-left font-medium px-4 py-3 min-w-32">Piping class</th>
                        <th className="text-left font-medium px-4 py-3 min-w-[360px]">Project Name</th>
                        <th className="text-left font-medium px-4 py-3 min-w-28">Status</th>
                        <th className="text-left font-medium px-4 py-3 min-w-44">Date</th>
                        <th className="text-left font-medium px-4 py-3"></th>
                        <th className="text-left font-medium px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, index) => {
                        return (
                          <tr key={row.id} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">{row.vds_number || "-"}</td>
                            <td className="px-4 py-3">{row.piping_class || "-"}</td>
                            <td className="px-4 py-3">
                              <div>{row.project_name || "-"}</div>
                              {row.project_code && row.project_code !== "-" && (
                                <div className="text-xs text-muted-foreground">{row.project_code}</div>
                              )}
                              {row.phase && row.phase !== "unknown" && (
                                <div className="text-xs text-muted-foreground">
                                  {row.phase === "pre_contract" ? "Pre-Contract" : row.phase === "post_contract" ? "Post-Contract" : row.phase}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant={row.status === "approved" ? "default" : "outline"}
                                className="text-xs capitalize"
                              >
                                {row.status === "approved"
                                  ? "Approved"
                                  : row.requires_revision
                                    ? "Revision Requested"
                                    : "Approval Pending"}
                              </Badge>
                              {row.requires_revision && row.reviewer_comment && (
                                <p className="text-xs text-amber-700 mt-1 max-w-xs truncate" title={row.reviewer_comment}>
                                  Reviewer: {row.reviewer_comment}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {formatDate(row.updated_at)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {row.status !== "approved" && row.status !== "void" && (isReviewerView || isEngineerView) && (
                                <Button
                                  size="sm"
                                  onClick={() => void handleSendOrReview(row)}
                                >
                                  {isReviewerView
                                    ? "Proceed to Review"
                                      : row.status === "pending_review"
                                        ? "Request to Review"
                                        : "Request to Approve"}
                                </Button>
                              )}                                
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="gap-1.5">
                                      <Download className="w-3.5 h-3.5" />
                                      Download
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start">
                                    <DropdownMenuItem
                                      onClick={() => handleDownloadByType(row, "xlsx")}
                                      disabled={row.file_type !== "xlsx" || !row.latest_download_id}
                                    >
                                      Excel (XLSX)
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
