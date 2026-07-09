import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, User, Loader2, ExternalLink, ChevronDown, ChevronUp, Sparkles, ClipboardCopy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import api, { type DatasheetResponse } from "@/services/api";
import {
  VALVE_TYPE_OPTIONS,
  SEAT_OPTIONS,
  END_CONNECTION_OPTIONS,
  BORE_OPTIONS,
  DESIGN_OPTIONS,
  buildVdsCode,
  summarizeFields,
  getLabel,
  type VdsFields,
} from "@/lib/vdsParser";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BotMessage {
  id: string;
  role: "bot";
  text: string;
}

interface UserMessage {
  id: string;
  role: "user";
  text: string;
}

interface ResultMessage {
  id: string;
  role: "result";
  vdsCode: string;
  fields: VdsFields;
  datasheet: DatasheetResponse;
}

type ChatMessage = BotMessage | UserMessage | ResultMessage;

interface GeneratedSheet {
  id: string;
  vdsCode: string;
  fields: VdsFields;
  completionPct: number;
  generatedAt: Date;
}

const WELCOME = "Hello! I'll help you generate a VDS datasheet. Select the valve type, seat material, enter your piping spec below, then hit Generate.";

// ─── Chip selector ────────────────────────────────────────────────────────────

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: { code: string; label: string }[];
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.code}
          type="button"
          onClick={() => onChange(opt.code)}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium border transition-all",
            value === opt.code
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "border-border bg-background hover:border-primary/60 hover:bg-accent text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Message bubbles ──────────────────────────────────────────────────────────

function BotBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm text-foreground">
        {text}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
        {text}
      </div>
      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <User className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function ResultBubble({
  vdsCode,
  fields,
  datasheet,
  onOpenGenerator,
}: {
  vdsCode: string;
  fields: VdsFields;
  datasheet: DatasheetResponse;
  onOpenGenerator: () => void;
}) {
  const { toast } = useToast();
  const pct = datasheet.metadata.completion.percentage;
  const populated = datasheet.metadata.completion.populated;
  const total = datasheet.metadata.completion.total;

  const copyVds = () => {
    navigator.clipboard.writeText(vdsCode);
    toast({ title: "Copied!", description: `${vdsCode} copied to clipboard.` });
  };

  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3 space-y-3">
        <p className="text-sm text-foreground">Datasheet generated successfully!</p>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">VDS Code:</span>
          <code className="px-2 py-0.5 rounded bg-background border border-border text-sm font-mono font-semibold text-primary">
            {vdsCode}
          </code>
          <button onClick={copyVds} className="text-muted-foreground hover:text-foreground transition-colors">
            <ClipboardCopy className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Completion</span>
            <span>{populated}/{total} fields ({Math.round(pct)}%)</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-background overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Field summary */}
        <div className="text-xs text-muted-foreground">
          {getLabel(VALVE_TYPE_OPTIONS, fields.valveType)}
          {fields.valveType === "BL" && ` · ${getLabel(BORE_OPTIONS, fields.bore ?? "R")}`}
          {fields.valveType === "NE" && ` · ${getLabel(DESIGN_OPTIONS, fields.design ?? "I")}`}
          {` · ${getLabel(SEAT_OPTIONS, fields.seat)} seat`}
          {` · Spec ${fields.spec.toUpperCase()}`}
          {` · ${getLabel(END_CONNECTION_OPTIONS, fields.endConnection ?? "R")}`}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-0.5">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={onOpenGenerator}>
            <ExternalLink className="w-3.5 h-3.5" />
            Open in Generator
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VdsAssistantPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Form state
  const [valveType, setValveType] = useState("");
  const [seat, setSeat] = useState("");
  const [spec, setSpec] = useState("");
  const [endConnection, setEndConnection] = useState("R");
  const [bore, setBore] = useState("R");
  const [design, setDesign] = useState("I");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Chat + sheets state
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "bot", text: WELCOME },
  ]);

  const [generatedSheets, setGeneratedSheets] = useState<GeneratedSheet[]>(() => {
    try {
      const saved = sessionStorage.getItem("vds_assistant_sheets");
      if (!saved) return [];
      const parsed = JSON.parse(saved) as (Omit<GeneratedSheet, "generatedAt"> & { generatedAt: string })[];
      return parsed.map((s) => ({ ...s, generatedAt: new Date(s.generatedAt) }));
    } catch {
      return [];
    }
  });

  // Persist sheets list across navigation
  useEffect(() => {
    sessionStorage.setItem("vds_assistant_sheets", JSON.stringify(generatedSheets));
  }, [generatedSheets]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = (msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  };

  const handleGenerate = async () => {
    if (!valveType) {
      toast({ title: "Select a valve type", variant: "destructive" });
      return;
    }
    if (!seat) {
      toast({ title: "Select a seat material", variant: "destructive" });
      return;
    }
    if (!spec.trim()) {
      toast({ title: "Enter a piping spec (e.g. A1)", variant: "destructive" });
      return;
    }

    const fields: VdsFields = {
      valveType,
      seat,
      spec: spec.trim().toUpperCase(),
      endConnection,
      bore: valveType === "BL" ? bore : undefined,
      design: valveType === "NE" ? design : undefined,
    };

    const { vdsCode, errors } = buildVdsCode(fields);
    if (errors.length > 0) {
      toast({ title: "Invalid input", description: errors[0], variant: "destructive" });
      return;
    }

    addMessage({
      id: `user-${Date.now()}`,
      role: "user",
      text: summarizeFields(fields),
    });

    setIsGenerating(true);
    try {
      const datasheet = await api.generateDatasheet(vdsCode);

      const resultId = `result-${Date.now()}`;
      addMessage({ id: resultId, role: "result", vdsCode, fields, datasheet });

      setGeneratedSheets((prev) => [
        {
          id: resultId,
          vdsCode,
          fields,
          completionPct: datasheet.metadata.completion.percentage,
          generatedAt: new Date(),
        },
        ...prev,
      ]);
    } catch (err: any) {
      const detail = err?.detail ?? err?.message ?? "Unknown error";
      addMessage({
        id: `err-${Date.now()}`,
        role: "bot",
        text: `Failed to generate datasheet for "${vdsCode}": ${detail}. Please check the piping spec and try again.`,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const openInGenerator = (vdsCode: string) => {
    navigate("/generator", { state: { vdsNumber: vdsCode } });
  };

  const isBallValve = valveType === "BL";
  const isNeedleValve = valveType === "NE";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Page Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-border bg-card shrink-0">
        <Sparkles className="w-4 h-4 text-primary" />
        <h1 className="text-sm font-semibold text-foreground">VDS Assistant</h1>
        <span className="text-xs text-muted-foreground">· Generate datasheets using minimal inputs</span>
      </div>

      {/* Body: Chat + Sheets Panel */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Chat Area ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-4">
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.map((msg) => {
                if (msg.role === "bot")
                  return <BotBubble key={msg.id} text={msg.text} />;
                if (msg.role === "user")
                  return <UserBubble key={msg.id} text={msg.text} />;
                if (msg.role === "result")
                  return (
                    <ResultBubble
                      key={msg.id}
                      vdsCode={msg.vdsCode}
                      fields={msg.fields}
                      datasheet={msg.datasheet}
                      onOpenGenerator={() => openInGenerator(msg.vdsCode)}
                    />
                  );
              })}
              {isGenerating && (
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Generating datasheet…</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* ── Input Form ──────────────────────────────────────── */}
          <div className="shrink-0 border-t border-border bg-card p-4">
            <div className="max-w-2xl mx-auto space-y-3">

              {/* Row 1: Valve Type */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Valve Type <span className="text-destructive">*</span>
                </label>
                <ChipGroup options={VALVE_TYPE_OPTIONS} value={valveType} onChange={setValveType} />
              </div>

              {/* Row 2: Seat + Spec */}
              <div className="flex flex-wrap gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Seat Material <span className="text-destructive">*</span>
                  </label>
                  <ChipGroup options={SEAT_OPTIONS} value={seat} onChange={setSeat} />
                </div>

                <div className="space-y-1 flex-1 min-w-[140px]">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Piping Spec <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="e.g. A1, T50A, 150"
                    value={spec}
                    onChange={(e) => setSpec(e.target.value.toUpperCase())}
                    maxLength={4}
                    className="h-8 text-sm uppercase font-mono w-36"
                    onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                  />
                </div>
              </div>

              {/* Advanced (optional fields) */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  Advanced options
                  <span className="text-muted-foreground/60">
                    (End Connection{isBallValve ? ", Bore" : isNeedleValve ? ", Design" : ""})
                  </span>
                </button>

                {showAdvanced && (
                  <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-border space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        End Connection <span className="text-muted-foreground/60">(default: Raised Face)</span>
                      </label>
                      <ChipGroup options={END_CONNECTION_OPTIONS} value={endConnection} onChange={setEndConnection} />
                    </div>

                    {isBallValve && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Bore <span className="text-muted-foreground/60">(default: Reduced)</span>
                        </label>
                        <ChipGroup options={BORE_OPTIONS} value={bore} onChange={setBore} />
                      </div>
                    )}

                    {isNeedleValve && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Design <span className="text-muted-foreground/60">(default: Inline)</span>
                        </label>
                        <ChipGroup options={DESIGN_OPTIONS} value={design} onChange={setDesign} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Generate Button */}
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-muted-foreground">
                  Defaults: Raised Face end · Reduced Bore (BV) · Inline (NV)
                </p>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="gap-2"
                  size="sm"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Generate Datasheet
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Generated Sheets Side Panel ───────────────────────── */}
        <div className="w-64 shrink-0 border-l border-border flex flex-col bg-card">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Generated Sheets</h2>
            <p className="text-xs text-muted-foreground mt-0.5">This session</p>
          </div>

          <ScrollArea className="flex-1">
            {generatedSheets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 px-4 text-center">
                <Bot className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">No sheets generated yet.</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {generatedSheets.map((sheet) => (
                  <div
                    key={sheet.id}
                    className="rounded-lg border border-border bg-background p-3 space-y-2 hover:border-primary/40 transition-colors cursor-default"
                  >
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-mono font-semibold text-primary">{sheet.vdsCode}</code>
                      <Badge variant="secondary" className="text-[10px]">
                        {Math.round(sheet.completionPct)}%
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {getLabel(VALVE_TYPE_OPTIONS, sheet.fields.valveType)}
                      {" · "}{getLabel(SEAT_OPTIONS, sheet.fields.seat)}
                      {" · "}{sheet.fields.spec.toUpperCase()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {sheet.generatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-6 text-[11px] gap-1"
                      onClick={() => openInGenerator(sheet.vdsCode)}
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open in Generator
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
