import { AppHeader } from "@/components/layout/AppHeader";
import { Panel } from "@/components/common/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";

const validationRules = [
  {
    id: "VR-001",
    category: "Pressure Rating",
    rule: "Design pressure must not exceed pressure class rating at design temperature",
    status: "passed",
    details: "150 barg @ 120°C is within Class 600 allowable (157.3 barg per ASME B16.34)",
    affectedFields: ["Design Pressure", "Rating"],
  },
  {
    id: "VR-002",
    category: "Temperature Limits",
    rule: "Design temperature must be within material allowable range",
    status: "passed",
    details: "A216 WCB allowable range: -29°C to 425°C. Design temp 120°C is compliant.",
    affectedFields: ["Design Temperature", "Body Material"],
  },
  {
    id: "VR-003",
    category: "Size Consistency",
    rule: "Valve size should match line size unless reduced bore is specified",
    status: "warning",
    details: "Line 20-PG-3102-3-A1A is 6\" but valve is specified as 4\". Confirm reduced bore is intentional.",
    affectedFields: ["Size", "Line Number"],
  },
  {
    id: "VR-004",
    category: "Cv Adequacy",
    rule: "Selected Cv must be ≥ calculated Cv with minimum 10% margin",
    status: "passed",
    details: "Cv selected (140) / Cv required (125) = 112% margin. Acceptable.",
    affectedFields: ["Cv Required", "Cv Selected"],
  },
  {
    id: "VR-005",
    category: "Material Compatibility",
    rule: "Metallurgy must be compatible with process fluid and conditions",
    status: "passed",
    details: "A216 WCB with 316SS trim is suitable for natural gas service. No H2S detected in process data.",
    affectedFields: ["Body Material", "Trim Material", "Fluid"],
  },
  {
    id: "VR-006",
    category: "Face-to-Face Dimension",
    rule: "Face-to-face must match ASME B16.10 for valve type and class",
    status: "passed",
    details: "241mm matches ASME B16.10 Table 1 for 4\" Class 600 globe valve.",
    affectedFields: ["Face-to-Face", "Size", "Rating"],
  },
  {
    id: "VR-007",
    category: "Fail Position",
    rule: "Fail action must match P&ID safety requirements",
    status: "passed",
    details: "Fail Close specified matches P&ID note for suction isolation requirement.",
    affectedFields: ["Action"],
  },
];

const auditLog = [
  {
    timestamp: "2024-01-15 14:32:15",
    user: "Feroz Ahmad",
    action: "Generated",
    description: "Initial datasheet generation from PMS and process data",
    tag: "20-PCV-3102",
  },
  {
    timestamp: "2024-01-15 14:32:18",
    user: "System",
    action: "Validated",
    description: "7 validation rules executed. 1 warning detected.",
    tag: "20-PCV-3102",
  },
  {
    timestamp: "2024-01-15 15:45:00",
    user: "M. Chen",
    action: "Reviewed",
    description: "Added comment regarding size reduction verification",
    tag: "20-PCV-3102",
  },
  {
    timestamp: "2024-01-15 16:20:00",
    user: "Feroz Ahmad",
    action: "Modified",
    description: "Confirmed 4\" size is intentional per sizing calculation",
    tag: "20-PCV-3102",
  },
];

const statusIconComponent = {
  passed: CheckCircle,
  warning: AlertTriangle,
  failed: XCircle,
};

const statusIconClass = {
  passed: "w-5 h-5 text-validated",
  warning: "w-5 h-5 text-assumption",
  failed: "w-5 h-5 text-conflict",
};

const statusBg = {
  passed: "bg-validated-bg border-validated/20",
  warning: "bg-assumption-bg border-assumption/20",
  failed: "bg-conflict-bg border-conflict/20",
};

function StatusIcon({ status }: { status: keyof typeof statusIconComponent }) {
  const Icon = statusIconComponent[status];
  return <Icon className={statusIconClass[status]} />;
}

export default function ValidationPage() {
  const passedCount = validationRules.filter((r) => r.status === "passed").length;
  const warningCount = validationRules.filter((r) => r.status === "warning").length;
  const failedCount = validationRules.filter((r) => r.status === "failed").length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader
        title="Validation & Error Prevention"
        breadcrumbs={[
          { label: "FPSO Prosperity", href: "/" },
          { label: "Validation" },
        ]}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                <span className="text-xl font-bold text-foreground">
                  {validationRules.length}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Total Rules</p>
                <p className="text-xs text-muted-foreground">Executed checks</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-validated-bg flex items-center justify-center">
                <span className="text-xl font-bold text-validated">{passedCount}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Passed</p>
                <p className="text-xs text-muted-foreground">All requirements met</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-assumption-bg flex items-center justify-center">
                <span className="text-xl font-bold text-assumption-foreground">
                  {warningCount}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Warnings</p>
                <p className="text-xs text-muted-foreground">Review recommended</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-conflict-bg flex items-center justify-center">
                <span className="text-xl font-bold text-conflict">{failedCount}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Failed</p>
                <p className="text-xs text-muted-foreground">Action required</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Validation Rules */}
            <div className="lg:col-span-2">
              <Panel
                title="Validation Rules"
                description="Engineering rule checks for 20-PCV-3102"
                actions={
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Filter className="w-3.5 h-3.5" />
                      Filter
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Re-run
                    </Button>
                  </div>
                }
              >
                <div className="space-y-3">
                  {validationRules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`p-4 rounded-lg border ${statusBg[rule.status as keyof typeof statusBg]}`}
                    >
                      <div className="flex items-start gap-3">
                        <StatusIcon status={rule.status as keyof typeof statusIconComponent} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-muted-foreground">
                              {rule.id}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {rule.category}
                            </Badge>
                          </div>
                          <p className="font-medium text-sm mt-1">{rule.rule}</p>
                          <p className="text-sm text-muted-foreground mt-2">
                            {rule.details}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {rule.affectedFields.map((field) => (
                              <span
                                key={field}
                                className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-[10px] font-medium"
                              >
                                {field}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            {/* Audit Log */}
            <div>
              <Panel
                title="Audit Log"
                description="Change history"
                actions={
                  <Link to="/approval">
                    <Button variant="ghost" size="sm" className="gap-1">
                      Full History <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                }
              >
                <div className="space-y-4">
                  {auditLog.map((entry, idx) => (
                    <div key={idx} className="relative pl-6 pb-4 border-l-2 border-border last:border-0 last:pb-0">
                      <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-primary" />
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">{entry.user}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {entry.action}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {entry.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {entry.timestamp}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              {/* Quick Actions */}
              <div className="mt-4">
                <Panel title="Actions">
                  <div className="space-y-2">
                    <Link to="/preview" className="block">
                      <Button variant="outline" className="w-full justify-start gap-2">
                        View Datasheet
                        <ChevronRight className="w-4 h-4 ml-auto" />
                      </Button>
                    </Link>
                    <Link to="/approval" className="block">
                      <Button className="w-full justify-start gap-2">
                        Proceed to Approval
                        <ChevronRight className="w-4 h-4 ml-auto" />
                      </Button>
                    </Link>
                  </div>
                </Panel>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
