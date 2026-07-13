/**
 * DownloadLibrary — Shows history of downloaded datasheets with re-download.
 */

import { useState, useEffect } from "react";
import {
  Download, FileSpreadsheet, PackageOpen, Loader2, RotateCcw,
} from "lucide-react";
import { listDownloads, DownloadRecord } from "@/services/agentApi";
import { downloadBulkDatasheets, type DatasheetInput } from "@/lib/excelBuilder";

const AGENT_API_URL =
  import.meta.env.VITE_AGENT_API_URL || "http://localhost:8001/api";

interface Props {
  refreshTrigger?: number;
}

export function DownloadLibrary({ refreshTrigger }: Props) {
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [redownloading, setRedownloading] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listDownloads(30).then((data) => {
      if (!cancelled) {
        setDownloads(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [refreshTrigger]);

  const handleRedownload = async (dl: DownloadRecord) => {
    setRedownloading(dl.id);
    try {
      const resp = await fetch(`${AGENT_API_URL}/datasheets/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dl.vds_codes),
      });

      if (!resp.ok) return;
      const batch = await resp.json();
      const inputs: DatasheetInput[] = [];

      for (const result of batch.results || []) {
        if (result.status === "success" && result.data) {
          inputs.push({ vdsCode: result.vds_code, data: result.data });
        }
      }

      if (inputs.length > 0) {
        await downloadBulkDatasheets(inputs);
      }
    } finally {
      setRedownloading(null);
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (downloads.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <Download className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-xs text-gray-400">No downloads yet</p>
        <p className="text-[10px] text-gray-300 mt-1">
          Select VDS codes and download to see them here
        </p>
      </div>
    );
  }

  return (
    <div className="py-2">
      {downloads.map((dl) => {
        const isZip = dl.download_type === "zip";
        const isRedownloading = redownloading === dl.id;

        return (
          <div
            key={dl.id}
            className="group flex items-center gap-2 mx-2 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {isZip ? (
              <PackageOpen className="w-4 h-4 flex-shrink-0 text-purple-400" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 flex-shrink-0 text-green-500" />
            )}

            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-700 truncate">
                {dl.vds_codes.length <= 3
                  ? dl.vds_codes.join(", ")
                  : `${dl.vds_codes.slice(0, 2).join(", ")} +${dl.vds_codes.length - 2} more`}
              </div>
              <div className="text-[10px] text-gray-400">
                {dl.sheet_count} sheet{dl.sheet_count !== 1 ? "s" : ""} · {isZip ? "ZIP" : "XLSX"} · {formatTime(dl.created_at)}
              </div>
            </div>

            <button
              onClick={() => handleRedownload(dl)}
              disabled={isRedownloading}
              className="p-1.5 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
              title="Re-download"
            >
              {isRedownloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
