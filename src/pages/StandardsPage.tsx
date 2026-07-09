import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Panel } from "@/components/common/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BookOpen,
  Search,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  ChevronRight,
  Info,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const standards = [
  {
    code: "API 6D",
    title: "Pipeline and Piping Valves",
    version: "25th Edition, 2021",
    clauses: [
      { id: "5.1", title: "General Design Requirements", mappedFields: ["Body Material", "Rating"] },
      { id: "5.2.3", title: "Material Selection", mappedFields: ["Body Material", "Trim Material"] },
      { id: "7.4", title: "Testing Requirements", mappedFields: ["Test Pressure"] },
    ],
  },
  {
    code: "ASME B16.34",
    title: "Valves—Flanged, Threaded, and Welding End",
    version: "2020",
    clauses: [
      { id: "4.1", title: "Pressure-Temperature Ratings", mappedFields: ["Design Pressure", "Design Temperature", "Rating"] },
      { id: "5.1", title: "General Requirements", mappedFields: ["Body Material"] },
      { id: "6.1", title: "Shell Design", mappedFields: ["Wall Thickness"] },
    ],
  },
  {
    code: "ASME B16.5",
    title: "Pipe Flanges and Flanged Fittings",
    version: "2020",
    clauses: [
      { id: "3.1", title: "Flange Dimensions", mappedFields: ["End Connection", "Size"] },
      { id: "4.1", title: "Facing Finish", mappedFields: ["End Connection"] },
    ],
  },
  {
    code: "ASME B16.10",
    title: "Face-to-Face Dimensions of Valves",
    version: "2022",
    clauses: [
      { id: "Table 1", title: "Globe Valves - Class 600", mappedFields: ["Face-to-Face"] },
    ],
  },
  {
    code: "ISA 75.01",
    title: "Flow Equations for Sizing Control Valves",
    version: "2012 (R2017)",
    clauses: [
      { id: "4.1", title: "Cv Calculation", mappedFields: ["Cv Required", "Flow Rate"] },
      { id: "5.2", title: "Liquid Sizing", mappedFields: ["Cv Required"] },
    ],
  },
  {
    code: "API 607",
    title: "Fire Test for Quarter-turn Valves",
    version: "7th Edition, 2022",
    clauses: [
      { id: "6.1", title: "Fire Test Requirements", mappedFields: ["Fire Safe Certification"] },
    ],
  },
];

const fieldMappings = [
  {
    field: "Design Pressure",
    value: "150 barg",
    source: "Process Data",
    standards: ["ASME B16.34 Cl. 4.1"],
    validation: "P/T rating verified for Class 600 at 120°C",
  },
  {
    field: "Design Temperature",
    value: "120 °C",
    source: "Process Data",
    standards: ["ASME B16.34 Cl. 4.1"],
    validation: "Within allowable range for A216 WCB material",
  },
  {
    field: "Body Material",
    value: "A216 WCB",
    source: "Material Spec",
    standards: ["ASME B16.34 Cl. 5.1", "API 6D Cl. 5.2.3"],
    validation: "Approved material for sour service per NACE MR0175",
  },
  {
    field: "Rating",
    value: "Class 600",
    source: "Line Class",
    standards: ["ASME B16.34 Cl. 4.1", "API 6D Cl. 5.1"],
    validation: "Matches line class A1A requirements",
  },
  {
    field: "Cv Required",
    value: "125",
    source: "Calculation",
    standards: ["ISA 75.01 Cl. 4.1"],
    validation: "Calculated per ISA 75.01 liquid sizing equation",
  },
  {
    field: "Face-to-Face",
    value: "241 mm",
    source: "ASME B16.10",
    standards: ["ASME B16.10 Table 1"],
    validation: "Standard dimension for 4\" Class 600 Globe",
  },
];

export default function StandardsPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredStandards = standards.filter(
    (s) =>
      s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader
        title="Standards & Traceability"
        breadcrumbs={[
          { label: "FPSO Prosperity", href: "/" },
          { label: "Standards & Traceability" },
        ]}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Engineering Standards Reference</h2>
              <p className="text-sm text-muted-foreground">
                Traceability from datasheet fields to applicable codes and standards
              </p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search standards..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Standards List */}
            <Panel
              title="Applicable Standards"
              description="Industry codes mapped to this datasheet"
            >
              <Accordion type="multiple" className="space-y-2">
                {filteredStandards.map((standard) => (
                  <AccordionItem
                    key={standard.code}
                    value={standard.code}
                    className="border border-border rounded-lg px-4"
                  >
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center gap-3 text-left">
                        <BookOpen className="w-5 h-5 text-primary flex-shrink-0" />
                        <div>
                          <p className="font-mono font-semibold text-foreground">
                            {standard.code}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {standard.title}
                          </p>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-0 pb-4">
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          {standard.version}
                        </p>
                        <div className="space-y-2">
                          {standard.clauses.map((clause) => (
                            <div
                              key={clause.id}
                              className="flex items-start gap-3 p-2 bg-muted/30 rounded"
                            >
                              <FileText className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">
                                  <span className="font-mono">{clause.id}</span> -{" "}
                                  {clause.title}
                                </p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {clause.mappedFields.map((field) => (
                                    <span
                                      key={field}
                                      className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium"
                                    >
                                      {field}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 w-full justify-center"
                        >
                          View Full Standard
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Panel>

            {/* Field Traceability */}
            <Panel
              title="Field Traceability"
              description="Why each value was selected"
            >
              <div className="space-y-3">
                {fieldMappings.map((mapping) => (
                  <div
                    key={mapping.field}
                    className="p-3 border border-border rounded-lg hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{mapping.field}</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button>
                                <Info className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs">
                              <p className="text-xs">{mapping.validation}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="font-mono text-lg font-semibold text-foreground mt-0.5">
                          {mapping.value}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-border space-y-2">
                      <div className="flex items-center gap-2">
                        <LinkIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Source:
                        </span>
                        <span className="text-xs font-medium">{mapping.source}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <BookOpen className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                        <span className="text-xs text-muted-foreground">
                          Standards:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {mapping.standards.map((std) => (
                            <span
                              key={std}
                              className="inline-flex items-center px-2 py-0.5 rounded bg-validated-bg text-validated text-[10px] font-mono"
                            >
                              {std}
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

          {/* Traceability Summary */}
          <Panel
            title="Traceability Matrix"
            description="Complete mapping of datasheet fields to source systems and standards"
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="data-table-header rounded-t-lg">
                    <th className="px-4 py-3 text-left">Field</th>
                    <th className="px-4 py-3 text-left">Value</th>
                    <th className="px-4 py-3 text-left">Source System</th>
                    <th className="px-4 py-3 text-left">Standard Reference</th>
                    <th className="px-4 py-3 text-left">Validation Logic</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldMappings.map((mapping, idx) => (
                    <tr key={mapping.field} className="data-table-row">
                      <td className="px-4 py-3 font-medium">{mapping.field}</td>
                      <td className="px-4 py-3 font-mono">{mapping.value}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {mapping.source}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {mapping.standards.map((std) => (
                            <span
                              key={std}
                              className="text-xs font-mono text-primary"
                            >
                              {std}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {mapping.validation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
