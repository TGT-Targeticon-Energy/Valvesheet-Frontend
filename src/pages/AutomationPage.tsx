import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Panel } from "@/components/common/Panel";
import { ProgressSteps } from "@/components/common/ProgressSteps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, FileText, BookOpen, Zap, Check, Loader2, Lock, ExternalLink, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const steps = [
  { id: "fetch", label: "Data Fetched", description: "PMS & Process" },
  { id: "validate", label: "Validated", description: "Rule Checks" },
  { id: "standards", label: "Standards Applied", description: "API, ASME, BS" },
  { id: "generate", label: "Datasheet Generated", description: "Ready for Review" },
];

const valveTypes = [
  { value: "ball", label: "Ball Valve" },
  { value: "gate", label: "Gate Valve" },
  { value: "globe", label: "Globe Valve" },
  { value: "check", label: "Check Valve" },
  { value: "dbb", label: "Double Block & Bleed (DBB)" },
  { value: "needle", label: "Needle Valve" },
];

const pmsFields = [
  {
    label: "Tag Number",
    value: "20-PCV-3102",
    source: "PMS",
    locked: true,
    description: "Unique valve identifier from Plant Management System",
  },
  {
    label: "Service",
    value: "Gas Compression Suction",
    source: "PMS",
    locked: true,
    description: "Process service description from P&ID",
  },
  {
    label: "Metallurgy",
    value: "A216 WCB / 316SS Trim",
    source: "PMS",
    locked: true,
    description: "Body and trim material specification",
  },
  {
    label: "Design Temperature",
    value: "120 °C",
    source: "PMS",
    locked: true,
    description: "Maximum design temperature from process data",
  },
  {
    label: "Design Pressure",
    value: "150 barg",
    source: "PMS",
    locked: true,
    description: "Maximum design pressure from process data",
  },
  {
    label: "Corrosion Allowance",
    value: "3.0 mm",
    source: "Standard",
    locked: true,
    description: "Per project material specification",
  },
  {
    label: "Pressure Rating",
    value: "Class 600",
    source: "Standard",
    locked: true,
    description: "ASME B16.34 pressure class based on P/T rating",
  },
  {
    label: "End Connection",
    value: "RF Flanged",
    source: "PMS",
    locked: true,
    description: "Flange type from line class specification",
  },
];

const applicableStandards = [
  { code: "API 6D", title: "Pipeline and Piping Valves", status: "active" },
  { code: "ASME B16.34", title: "Valves—Flanged, Threaded, and Welding End", status: "active" },
  { code: "ASME B16.5", title: "Pipe Flanges and Flanged Fittings", status: "active" },
  { code: "API 607", title: "Fire Test for Quarter-turn Valves", status: "active" },
];

export default function AutomationPage() {
  const [currentStep, setCurrentStep] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [dataFetched, setDataFetched] = useState(false);
  const [selectedValveType, setSelectedValveType] = useState("globe");
  const { toast } = useToast();

  const handleAutoGenerate = () => {
    setIsLoading(true);
    setCurrentStep(0);

    // Simulate step-by-step progress
    setTimeout(() => {
      setCurrentStep(1);
      setTimeout(() => {
        setCurrentStep(2);
        setTimeout(() => {
          setCurrentStep(3);
          setDataFetched(true);
          setIsLoading(false);
          toast({
            title: "Datasheet Generated Successfully",
            description: "All fields validated against applicable standards",
          });
        }, 1200);
      }, 1200);
    }, 1500);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader
        title="Valve Datasheet Automation"
        breadcrumbs={[{ label: "FPSO Prosperity", href: "/" }, { label: "Datasheet Automation" }]}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
          <Panel title="Project & Valve Context" description="Select project scope and valve identification">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label>Project / FPSO</Label>
                <Select defaultValue="prosperity">
                  <SelectTrigger>
                    <SelectValue placeholder="Select FPSO" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prosperity">FPSO Prosperity</SelectItem>
                    <SelectItem value="harmony">FPSO Harmony</SelectItem>
                    <SelectItem value="pioneer">FPSO Pioneer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unit / Line</Label>
                <Select defaultValue="gas">
                  <SelectTrigger>
                    <SelectValue placeholder="Select Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gas">Gas Compression</SelectItem>
                    <SelectItem value="separation">Separation</SelectItem>
                    <SelectItem value="water">Water Injection</SelectItem>
                    <SelectItem value="chemical">Chemical Injection</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valve Tag</Label>
                <Input placeholder="e.g., 20-PCV-3102" defaultValue="20-PCV-3102" className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Valve Type</Label>
                <Select value={selectedValveType} onValueChange={setSelectedValveType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {valveTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="invisible">Action</Label>
                <Button className="w-full gap-2" variant="outline" disabled={isLoading}>
                  <Database className="w-4 h-4" />
                  Load Tag
                </Button>
              </div>
            </div>
          </Panel>

          <Panel title="Automation Progress" description="Step-by-step datasheet generation workflow">
            <div className="flex flex-col items-center py-6">
              <ProgressSteps steps={steps} currentStep={currentStep} />
              <div className="mt-8">
                <Button
                  onClick={handleAutoGenerate}
                  disabled={isLoading || dataFetched}
                  size="lg"
                  className="gap-2 px-8"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : dataFetched ? (
                    <>
                      <Check className="w-5 h-5" />
                      Datasheet Generated
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Auto-Generate Datasheet
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel
              title="PMS-Driven Inputs"
              description="Auto-fetched from Plant Management System"
              actions={
                <Badge variant="secondary" className="gap-1">
                  <Lock className="w-3 h-3" />
                  System Controlled
                </Badge>
              }
            >
              <div className="space-y-1">
                {pmsFields.map((field) => (
                  <div
                    key={field.label}
                    className="flex items-center justify-between py-2.5 px-3 rounded hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">{field.label}</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <Info className="w-3 h-3 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs">
                              <p className="text-xs">{field.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="font-mono text-sm font-medium text-foreground mt-0.5">{field.value}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* <Badge 
                        variant="outline" 
                        className={`text-[10px] ${
                          field.source === "PMS" 
                            ? "bg-primary/5 text-primary border-primary/20" 
                            : "bg-validated-bg text-validated border-validated/20"
                        }`}
                      >
                        {field.source}
                      </Badge> */}
                      {field.locked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title="Applicable Standards"
              description="Engineering codes applied to this datasheet"
              actions={
                <Link to="/standards">
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    View Traceability <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              }
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
                  <BookOpen className="w-4 h-4 text-validated" />
                  Mapped Standards
                </div>
                {applicableStandards.map((standard) => (
                  <div
                    key={standard.code}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border"
                  >
                    <div>
                      <p className="font-mono text-sm font-medium text-foreground">{standard.code}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{standard.title}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-validated">
                      <Check className="w-4 h-4" />
                      <span className="text-xs font-medium">Active</span>
                    </div>
                  </div>
                ))}
              </div>

              {dataFetched && (
                <div className="mt-6 pt-4 border-t border-border">
                  <Link to="/preview">
                    <Button className="w-full gap-2" size="lg">
                      <FileText className="w-4 h-4" />
                      View Generated Datasheet
                    </Button>
                  </Link>
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
