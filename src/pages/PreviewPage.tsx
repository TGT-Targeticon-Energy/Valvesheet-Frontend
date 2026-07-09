import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Panel } from "@/components/common/Panel";
import { DataField } from "@/components/common/DataField";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Printer, Edit2, MessageSquare, Send, ChevronRight, GitBranch, FileSpreadsheet } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const datasheetSections = {
  valveType: {
    title: "1. Select Valve Type",
    fields: [
      { label: "Valve Type", value: "Globe", validation: { type: "validated" as const, source: "PMS" } },
      { label: "Sub-Type", value: "Control Valve", validation: { type: "validated" as const, source: "PMS" } },
    ],
  },
  pmsInputs: {
    title: "2. Select Inputs from Piping Material Specification (PMS)",
    fields: [
      {
        label: "Metallurgy",
        value: "A216 WCB / 316SS Trim",
        validation: { type: "validated" as const, source: "PMS", standard: "ASTM A216" },
      },
      { label: "Service", value: "Gas Compression Suction", validation: { type: "validated" as const, source: "PMS" } },
      {
        label: "Design Temperature",
        value: "120",
        unit: "°C",
        validation: { type: "validated" as const, source: "PMS" },
      },
      {
        label: "Design Pressure",
        value: "150",
        unit: "barg",
        validation: { type: "validated" as const, source: "PMS", standard: "ASME B16.34" },
      },
      {
        label: "Corrosion Allowance",
        value: "3.0",
        unit: "mm",
        validation: { type: "validated" as const, source: "Standard" },
      },
      {
        label: "Pressure Rating",
        value: "Class 600",
        validation: { type: "validated" as const, source: "PMS", standard: "ASME B16.34" },
      },
      {
        label: "End Connection",
        value: "RF Flanged",
        validation: { type: "validated" as const, source: "PMS", standard: "ASME B16.5" },
      },
    ],
  },
  partsMaterials: {
    title: "3. Define Valve Parts Materials (as per PMS)",
    fields: [
      { label: "Body", value: "A216 WCB", validation: { type: "validated" as const, standard: "ASTM A216" } },
      { label: "Trim", value: "316SS", validation: { type: "validated" as const, standard: "ASTM A351" } },
      {
        label: "Seat",
        value: "316SS + Stellite 6 Overlay",
        validation: { type: "validated" as const, standard: "API 6D" },
      },
      {
        label: "Ball",
        value: "316SS + ENP Coating",
        validation: {
          type: "assumption" as const,
          message: "Standard project selection",
          source: "Engineering Assumption",
        },
      },
      { label: "Stem", value: "316SS", validation: { type: "validated" as const } },
      { label: "Gland", value: "316SS", validation: { type: "validated" as const } },
      { label: "Packing", value: "Graphite / PTFE", validation: { type: "validated" as const } },
      { label: "Lever", value: "Carbon Steel", validation: { type: "validated" as const } },
      { label: "Spring", value: "Inconel 718", validation: { type: "validated" as const } },
      {
        label: "Gaskets",
        value: "Spiral Wound 316SS/Graphite",
        validation: { type: "validated" as const, standard: "ASME B16.20" },
      },
      { label: "Bolts", value: "A193 B7 / A194 2H", validation: { type: "validated" as const, standard: "ASTM A193" } },
    ],
  },
  constructionDetails: {
    title: "4. Define Construction Details for Valve Parts",
    fields: [
      { label: "Body", value: "Full Port, Bolted Bonnet", validation: { type: "validated" as const } },
      { label: "Ball", value: "Floating Ball Design", validation: { type: "validated" as const } },
      {
        label: "Stem",
        value: "Blowout Proof, Anti-Static",
        validation: { type: "validated" as const, standard: "API 6D" },
      },
      { label: "Seat", value: "Metal-to-Metal, Bidirectional", validation: { type: "validated" as const } },
      {
        label: "Locks",
        value: "Lockable Handle Position",
        validation: { type: "assumption" as const, message: "Per project safety requirements", source: "Project Spec" },
      },
    ],
  },
  modeOfOperation: {
    title: "5. Define Mode of Operation",
    fields: [
      {
        label: "Primary Operation",
        value: "Lever Operated",
        validation: { type: "validated" as const, source: "P&ID" },
      },
      { label: "Gear Operation", value: "Not Required", validation: { type: "validated" as const } },
      {
        label: "Actuator",
        value: "Pneumatic Diaphragm (if applicable)",
        validation: { type: "validated" as const, source: "P&ID" },
      },
      { label: "Fail Action", value: "Fail Close", validation: { type: "validated" as const, source: "P&ID" } },
    ],
  },
  testPressures: {
    title: "6. Define Test Pressures",
    fields: [
      {
        label: "Hydrostatic Shell Test",
        value: "375",
        unit: "barg",
        validation: { type: "validated" as const, standard: "API 6D Cl. 7.4.2" },
      },
      {
        label: "Hydrostatic Closure Test",
        value: "250",
        unit: "barg",
        validation: { type: "validated" as const, standard: "API 6D Cl. 7.4.3" },
      },
      {
        label: "Pneumatic Low Pressure (LP) Test",
        value: "6",
        unit: "barg",
        validation: { type: "validated" as const, standard: "API 6D Cl. 7.4.4" },
      },
    ],
  },
  valveStandard: {
    title: "7. Define Valve Standard",
    fields: [
      { label: "API", value: "API 6D - Pipeline and Piping Valves", validation: { type: "validated" as const } },
      { label: "ASME", value: "ASME B16.34, B16.5, B16.10", validation: { type: "validated" as const } },
      { label: "BS", value: "BS EN 1092-1 (Flanges)", validation: { type: "validated" as const } },
      { label: "Other", value: "ISA 75.01 (Control Valve Sizing)", validation: { type: "validated" as const } },
    ],
  },
  codeCompliance: {
    title: "8. Define Code & Compliance Requirements",
    fields: [
      {
        label: "Fire Safe Rating",
        value: "API 607 Certified",
        validation: { type: "validated" as const, standard: "API 607" },
      },
      { label: "Material Certification", value: "EN 10204 3.1", validation: { type: "validated" as const } },
      { label: "Inspection & Testing", value: "API 6D / ISO 5208", validation: { type: "validated" as const } },
      {
        label: "Leakage Rate Class",
        value: "Rate A (Zero Leakage)",
        validation: {
          type: "conflict" as const,
          message: "Verify if Rate A is achievable for metal-seated valve",
          source: "Engineering Review",
        },
      },
    ],
  },
  generalNotes: {
    title: "9. Define General Notes",
    fields: [
      {
        label: "Project-specific notes",
        value: "All valves to be tagged per project numbering system",
        validation: { type: "validated" as const },
      },
      {
        label: "Installation notes",
        value: "Install with flow direction arrow pointing downstream",
        validation: { type: "validated" as const },
      },
      {
        label: "Assumptions & deviations",
        value: "Cv selection based on vendor catalog rev. 5.2",
        validation: { type: "assumption" as const, message: "To be confirmed with vendor", source: "Engineering" },
      },
    ],
  },
};

const generateCSVContent = () => {
  const lines: string[] = [];
  lines.push("Section,Field,Value,Unit,Source,Standard");

  Object.entries(datasheetSections).forEach(([, section]) => {
    section.fields.forEach((field) => {
      const unit = field.unit || "";
      const source = field.validation?.source || "";
      const standard = field.validation?.standard || "";
      lines.push(`"${section.title}","${field.label}","${field.value}","${unit}","${source}","${standard}"`);
    });
  });

  return lines.join("\n");
};

const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default function PreviewPage() {
  const [comment, setComment] = useState("");
  const { toast } = useToast();

  const handleAddComment = () => {
    if (comment.trim()) {
      toast({
        title: "Comment Added",
        description: "Your comment has been saved to the datasheet",
      });
      setComment("");
    }
  };

  const handlePrint = () => {
    window.print();
    toast({
      title: "Print Dialog Opened",
      description: "Use your browser's print function to print the datasheet",
    });
  };

  const handleExportPDF = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Valve Datasheet - 20-PCV-3102</title>
            <style>
              body { font-family: 'IBM Plex Sans', Arial, sans-serif; padding: 20px; }
              h1 { color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; }
              h2 { color: #2d5a87; margin-top: 20px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
              table { width: 100%; border-collapse: collapse; margin: 10px 0; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f5f5f5; }
              .validated { color: #22c55e; }
              .assumption { color: #f59e0b; }
              .conflict { color: #ef4444; }
              @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
            </style>
          </head>
          <body>
            <h1>Valve Datasheet</h1>
            <p><strong>Tag Number:</strong> 20-PCV-3102</p>
            <p><strong>Service:</strong> Pressure Control Valve - Gas Compression Suction</p>
            <p><strong>Version:</strong> v3</p>
            <p><strong>Status:</strong> Generated</p>
            <hr />
            ${Object.entries(datasheetSections)
              .map(
                ([, section]) => `
              <h2>${section.title}</h2>
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Value</th>
                    <th>Unit</th>
                    // <th>Source</th>
                    <th>Standard</th>
                  </tr>
                </thead>
                <tbody>
                  ${section.fields
                    .map(
                      (field) => `
                    <tr>
                      <td>${field.label}</td>
                      <td>${field.value}</td>
                      <td>${field.unit || "-"}</td>
                      // <td>${field.validation?.source || "-"}</td>
                      <td>${field.validation?.standard || "-"}</td>
                    </tr>
                  `,
                    )
                    .join("")}
                </tbody>
              </table>
            `,
              )
              .join("")}
            <hr />
            <p><em>Generated by FPSO AutoGen Engineering Platform</em></p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
    toast({
      title: "PDF Export Ready",
      description: "Use 'Save as PDF' in the print dialog to save the datasheet",
    });
  };

  const handleExportExcel = () => {
    const csvContent = generateCSVContent();
    downloadFile(csvContent, "Valve_Datasheet_20-PCV-3102.csv", "text/csv;charset=utf-8;");
    toast({
      title: "Excel Export Complete",
      description: "Datasheet exported as CSV file (compatible with Excel)",
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader
        title="Datasheet Preview & Editor"
        breadcrumbs={[
          { label: "FPSO Prosperity", href: "/" },
          { label: "Automation", href: "/automation" },
          { label: "20-PCV-3102" },
        ]}
      />

      <div className="flex-1 overflow-auto p-6 print:p-0">
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
          {/* Header Info */}
          <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-xl font-semibold font-mono">20-PCV-3102</h2>
                <p className="text-sm text-muted-foreground">Pressure Control Valve - Gas Compression Suction</p>
              </div>
              <StatusBadge status="generated" />
              <Badge variant="outline" className="gap-1 font-mono">
                <GitBranch className="w-3 h-3" />
                v3
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
                <Printer className="w-4 h-4" />
                Print
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={handleExportPDF}>
                <Download className="w-4 h-4" />
                Export PDF
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={handleExportExcel}>
                <FileSpreadsheet className="w-4 h-4" />
                Export Excel
              </Button>
              <Link to="/approval">
                <Button size="sm" className="gap-2">
                  Submit for Approval
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-6 p-3 bg-muted/30 rounded-lg border border-border flex-wrap print:hidden">
            <span className="text-xs font-medium text-muted-foreground">Validation Legend:</span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded validation-validated flex items-center justify-center">
                  <span className="text-[10px]">✓</span>
                </div>
                <span className="text-xs">Validated</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded validation-assumption flex items-center justify-center">
                  <span className="text-[10px]">!</span>
                </div>
                <span className="text-xs">Assumption</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded validation-conflict flex items-center justify-center">
                  <span className="text-[10px]">✗</span>
                </div>
                <span className="text-xs">Conflict</span>
              </div>
            </div>
            <Link to="/standards" className="ml-auto text-xs text-primary hover:underline">
              View Standards Traceability →
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Datasheet */}
            <div className="lg:col-span-2 space-y-4">
              {Object.entries(datasheetSections).map(([key, section]) => (
                <Panel key={key} title={section.title}>
                  <div className="space-y-1">
                    {section.fields.map((field) => (
                      <DataField
                        key={field.label}
                        label={field.label}
                        value={field.value}
                        unit={field.unit}
                        validation={field.validation}
                        autoFilled
                        editable
                        onEdit={() => {}}
                      />
                    ))}
                  </div>
                </Panel>
              ))}
            </div>

            {/* Side Panel */}
            <div className="space-y-4 print:hidden">
              <Panel
                title="Comments & Notes"
                actions={<span className="text-xs text-muted-foreground">2 comments</span>}
              >
                <div className="space-y-3">
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">M. Chen</span>
                      <span className="text-[10px] text-muted-foreground">2h ago</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Verify leakage rate class with vendor for metal-seated design.
                    </p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">Feroz Ahmad</span>
                      <span className="text-[10px] text-muted-foreground">4h ago</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Material selection per project spec rev. 3.0</p>
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add a comment..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="min-h-[60px]"
                    />
                  </div>
                  <Button size="sm" className="w-full gap-2" onClick={handleAddComment}>
                    <Send className="w-3.5 h-3.5" />
                    Add Comment
                  </Button>
                </div>
              </Panel>

              <Panel title="Edit & Override">
                <p className="text-xs text-muted-foreground mb-3">
                  Override auto-filled values with engineering justification
                </p>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full gap-2">
                      <Edit2 className="w-4 h-4" />
                      Edit Field Value
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Override Field Value</DialogTitle>
                      <DialogDescription>Provide a reason for overriding the auto-populated value</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Field</Label>
                        <Input value="Leakage Rate Class" readOnly className="bg-muted" />
                      </div>
                      <div className="space-y-2">
                        <Label>Current Value</Label>
                        <Input value="Rate A (Zero Leakage)" readOnly className="bg-muted" />
                      </div>
                      <div className="space-y-2">
                        <Label>New Value</Label>
                        <Input placeholder="Enter new value" />
                      </div>
                      <div className="space-y-2">
                        <Label>Reason for Override</Label>
                        <Textarea placeholder="Provide engineering justification..." />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline">Cancel</Button>
                      <Button>Save Override</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </Panel>

              {/* Quick Links */}
              <Panel title="Related Documents">
                <div className="space-y-2">
                  <a href="#" className="flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors text-sm">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <span>P&ID P-3102-001</span>
                  </a>
                  <a href="#" className="flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors text-sm">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <span>Valve Sizing Calculation</span>
                  </a>
                  <a href="#" className="flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors text-sm">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <span>Material Specification</span>
                  </a>
                  <a href="#" className="flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors text-sm">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <span>Piping Line Class A1A</span>
                  </a>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
