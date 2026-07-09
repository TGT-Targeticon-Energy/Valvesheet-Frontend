/**
 * InlinePMSPreview — full PMS report rendered inline inside the AI Agent chat.
 *
 * When the user clicks "View Details" on a match card, this component
 * calls `POST /api/compute-pms` once (and again whenever design
 * conditions are edited in the compact strip), then hands the response
 * straight to the shared `ReportPanel` from PMSGeneratorPage.
 *
 * The component does NO engineering math — same architecture as
 * PMSGeneratorPage. Every formula lives in `pms-generator-new` and
 * comes back through `/api/compute-pms`.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Download, X } from "lucide-react";

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
import { toast } from "sonner";

import {
  ReportPanel,
  JOINT_TYPES,
  type JointType,
} from "@/pages/PMSGeneratorPage";
import pmsApi, {
  ComputePMSResponse,
  PMSApiError,
  PMSRequest,
} from "@/services/pmsApi";

const triggerBrowserDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

interface Props {
  request: PMSRequest;
  initialDesignPbarg?: number | null;
  initialDesignTc?: number | null;
  onClose: () => void;
}

export default function InlinePMSPreview({
  request,
  initialDesignPbarg,
  initialDesignTc,
  onClose,
}: Props) {
  const rating = request.rating ?? "";
  const material = request.material;
  const ca = request.corrosion_allowance;
  const service = request.service;

  // ── Computed snapshot from /api/compute-pms ─────────────────────
  const [computed, setComputed] = useState<ComputePMSResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Design-condition inputs ─────────────────────────────────────
  const [designP, setDesignP] = useState<string>(
    initialDesignPbarg != null ? String(initialDesignPbarg) : "",
  );
  const [designT, setDesignT] = useState<string>(
    initialDesignTc != null ? String(initialDesignTc) : "",
  );
  const [mdmt, setMdmt] = useState<string>("-29");
  const [jointType, setJointType] = useState<JointType>("Seamless");
  const [didSeedDefaults, setDidSeedDefaults] = useState(false);

  // ── Download state ──────────────────────────────────────────────
  const [downloading, setDownloading] = useState(false);

  // ── Single debounced compute call. Fires for the initial mount and
  //    every design-condition edit. ────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const designP_n = parseFloat(designP);
        const designT_n = parseFloat(designT);
        const mdmt_n = parseFloat(mdmt);
        const r = await pmsApi.computePMS({
          rating,
          material,
          corrosion_allowance: ca,
          service,
          design_pressure_barg: Number.isFinite(designP_n) ? designP_n : null,
          design_temp_c:        Number.isFinite(designT_n) ? designT_n : null,
          mdmt_c:               Number.isFinite(mdmt_n)    ? mdmt_n    : null,
          joint_type:           jointType,
        });
        setComputed(r);

        if (!didSeedDefaults) {
          const eff = r.effective_design_conditions;
          if (eff.design_pressure_barg != null && !designP) {
            setDesignP(String(eff.design_pressure_barg));
          }
          if (eff.design_temp_c != null && !designT) {
            setDesignT(String(eff.design_temp_c));
          }
          if (eff.joint_type) {
            setJointType(eff.joint_type as JointType);
          }
          setDidSeedDefaults(true);
        }
      } catch (err) {
        const msg =
          err instanceof PMSApiError ? err.detail : (err as Error).message;
        setError(msg);
        setComputed(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rating, material, ca, service, designP, designT, mdmt, jointType]);

  const designPnum = parseFloat(designP);
  const designTnum = parseFloat(designT);
  const mdmtNum = parseFloat(mdmt);
  const designConditionsValid =
    Number.isFinite(designPnum) && designPnum > 0 && Number.isFinite(designTnum);

  const handleDownload = async () => {
    if (!computed || !designConditionsValid || downloading) return;
    setDownloading(true);
    try {
      const blob = await pmsApi.exportExcel({
        rating,
        material,
        ca,
        service,
        design_p_barg: designPnum,
        design_t_c: designTnum,
        mdmt_c: Number.isFinite(mdmtNum) ? mdmtNum : -29,
        joint_type: jointType,
      });
      const ratingTag = (rating || "").replace(/[^A-Za-z0-9]/g, "") || "NA";
      triggerBrowserDownload(
        blob,
        `PMS_${computed.class_code}_${ratingTag}.xlsx`,
      );
      toast.success(`Downloaded PMS_${computed.class_code}.xlsx`);
    } catch (err) {
      const msg =
        err instanceof PMSApiError ? err.detail : (err as Error).message;
      toast.error(`Export failed: ${msg}`);
    } finally {
      setDownloading(false);
    }
  };

  // ── Loading / error states ──────────────────────────────────────
  if (loading && !computed) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50/30 px-6 py-10 flex items-center justify-center gap-2 text-sm text-blue-800">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading PMS for {request.piping_class}…
      </div>
    );
  }
  if (error || !computed) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between">
        <span>Couldn't load PMS preview: {error || "Unknown error"}</span>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-3 space-y-3">
      {/* Compact design-conditions strip + actions */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg bg-white border border-border px-3 py-2">
        <div className="min-w-[110px]">
          <Label htmlFor={`dp-${request.piping_class}`} className="text-[11px]">
            Design P (barg)
          </Label>
          <Input
            id={`dp-${request.piping_class}`}
            type="number"
            step="0.1"
            value={designP}
            onChange={(e) => setDesignP(e.target.value)}
            className="h-8 text-sm mt-0.5"
          />
        </div>
        <div className="min-w-[110px]">
          <Label htmlFor={`dt-${request.piping_class}`} className="text-[11px]">
            Design T (°C)
          </Label>
          <Input
            id={`dt-${request.piping_class}`}
            type="number"
            step="1"
            value={designT}
            onChange={(e) => setDesignT(e.target.value)}
            className="h-8 text-sm mt-0.5"
          />
        </div>
        <div className="min-w-[100px]">
          <Label htmlFor={`mdmt-${request.piping_class}`} className="text-[11px]">
            MDMT (°C)
          </Label>
          <Input
            id={`mdmt-${request.piping_class}`}
            type="number"
            step="1"
            value={mdmt}
            onChange={(e) => setMdmt(e.target.value)}
            className="h-8 text-sm mt-0.5"
          />
        </div>
        <div className="min-w-[140px]">
          <Label htmlFor={`joint-${request.piping_class}`} className="text-[11px]">
            Joint Type
          </Label>
          <Select
            value={jointType}
            onValueChange={(v) => setJointType(v as JointType)}
          >
            <SelectTrigger
              id={`joint-${request.piping_class}`}
              className="h-8 text-sm mt-0.5"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOINT_TYPES.map((j) => (
                <SelectItem key={j.value} value={j.value}>
                  {j.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1" />
        <Button
          size="sm"
          disabled={!designConditionsValid || downloading}
          onClick={handleDownload}
        >
          {downloading ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5 mr-1.5" />
          )}
          Download Excel
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} title="Hide details">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Full ReportPanel — banner + 4 tabs, server-computed */}
      <ReportPanel
        computed={computed}
        rating={rating}
        material={material}
        ca={ca}
        service={service}
        jointType={jointType}
      />
    </div>
  );
}
