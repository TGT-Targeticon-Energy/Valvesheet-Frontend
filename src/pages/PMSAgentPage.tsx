/**
 * PMSAgentPage — Conversational chat UI for the PMS Generator AI Agent.
 *
 * Flow:
 *   1. Slot-filling conversation over POST /api/pms-agent/chat. The backend
 *      (pms-generator-new) tracks Rating / Material / CA / Service and
 *      asks for missing fields one turn at a time.
 *   2. When a value doesn't match the catalogue, the backend returns
 *      `field_suggestions` ("did you mean …?") which render as clickable
 *      chips — one click submits the corrected value.
 *   3. Matching results render as multi-select cards. User ticks any
 *      subset (or Select All) and clicks "Download Selected (ZIP)" to get
 *      one ZIP archive back. Per-card "Download" buttons also exist for
 *      single-file downloads. The new backend applies sensible default
 *      design conditions (cold-point pressure, 50 °C, MDMT -29 °C,
 *      Seamless joint) when none are stated in the chat.
 */
import { useEffect, useRef, useState } from "react";
import {
  Send,
  Sparkles,
  Loader2,
  Search,
  Zap,
  RotateCcw,
  Download,
  Archive,
  CircleCheck,
  CircleDashed,
  Lightbulb,
  Eye,
  EyeOff,
  Bookmark,
  BookmarkCheck,
  History as HistoryIcon,
  X as CloseIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PMSConversationSidebar } from "@/components/pms/PMSConversationSidebar";
import InlinePMSPreview from "@/components/pms/InlinePMSPreview";
import {
  getCurrentSessionId,
  getSession,
  newSessionId,
  saveSession,
  setCurrentSessionId,
  HistoryEndpointMissingError,
  HistoryUnavailableError,
} from "@/services/pmsAgentHistory";
import pmsApi, {
  PMSAgentClassMatch,
  PMSAgentFieldSuggestion,
  PMSAgentHistoryTurn,
  PMSAgentResponse,
  PMSApiError,
  PMSRequest,
  SavePMSExistingMeta,
  SavePMSRequest,
} from "@/services/pmsApi";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Block types rendered in the message list ───────────────────────
interface UserBlock {
  kind: "user";
  text: string;
}
interface AssistantBlock {
  kind: "assistant";
  response: PMSAgentResponse;
}
interface ErrorBlock {
  kind: "error";
  message: string;
  lastPrompt: string;
}
type MessageBlock = UserBlock | AssistantBlock | ErrorBlock;

// ── Starter prompts — cover every major flow the agent supports, each
// slot demonstrating a distinct user intent so newcomers can copy the
// closest example to their actual question:
//
//   1. Generate + design point  — the most common real-world query
//      (engineer has a P&ID with pressure/temperature already on it).
//   2. NACE + service phrasing  — agent understands engineering
//      shorthand, not just the SS316L NACE catalog string.
//   3. Service-driven material  — user says "Raw Sea Water", agent
//      picks GRE / CuNi / 316L from materials catalogued for that.
//   4. Tubing series            — surfaces the Tubing A/B/C restricted
//      ratings (without an example here nobody discovers them).
//   5. Class deep-dive + follow-up — shows the agent can answer
//      questions about an existing class, not just generate new ones.
//   6. Filter / discovery       — list/enumerate capability; useful
//      when the user doesn't know which class they want yet.
const STARTER_PROMPTS = [
  "Generate 150# CS 3 mm at 19 barg, 50°C",
  "600# SS316L NACE for sour hydrocarbon",
  "150# GRE for Raw Sea Water",
  "Tubing A for instrument lines",
  "Tell me about D25N — show the P-T curve",
  "List all NACE-compliant 600# classes",
];

export default function PMSAgentPage() {
  const [blocks, setBlocks] = useState<MessageBlock[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  // Per-assistant-block selection: keyed by block index → set of piping_class codes
  const [selection, setSelection] = useState<Record<number, Set<string>>>({});
  // Per-card download spinner: key = `${blockIndex}:${piping_class}`
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  // Bulk-download spinner: key = block index
  const [bulkDownloadingIdx, setBulkDownloadingIdx] = useState<number | null>(null);
  // Which inline PMS previews are currently expanded.
  // Key: `${blockIdx}:${piping_class}` → the PMSRequest used to fetch.
  const [expandedPreviews, setExpandedPreviews] = useState<
    Record<string, { request: PMSRequest; design_pressure_barg: number | null; design_temp_c: number | null }>
  >({});
  // Save-to-shortlist state, also keyed by `${blockIdx}:${piping_class}`.
  // `savingKey` = currently in-flight; `savedKeys` = succeeded this session.
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  // Confirmation dialog state for the "PMS already saved — overwrite?"
  // case. Populated when the backend returns 409, cleared on
  // confirm / cancel.
  const [overwritePrompt, setOverwritePrompt] = useState<{
    key: string;
    payload: SavePMSRequest;
    existing: SavePMSExistingMeta;
    label: string; // human-readable class label for the dialog body
  } | null>(null);
  // Conversation history (localStorage-backed)
  const [sessionId, setSessionId] = useState<string>(
    () => getCurrentSessionId() || newSessionId(),
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Bumped on every blocks change → sidebar re-reads from backend
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  // Status of the most-recent auto-save. "idle" = nothing to report,
  // "saving" = in-flight, "saved" = succeeded, "off" = DB not configured
  // (503), "missing" = endpoints not deployed (404), "error" = other.
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "off" | "missing" | "error"
  >("idle");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isEmpty = blocks.length === 0;

  // On mount, restore the active session (if any) from the backend so
  // navigating away and back preserves the conversation.
  useEffect(() => {
    let cancelled = false;
    setCurrentSessionId(sessionId);
    (async () => {
      try {
        const existing = await getSession(sessionId);
        if (
          !cancelled &&
          existing &&
          Array.isArray(existing.blocks) &&
          existing.blocks.length > 0
        ) {
          setBlocks(existing.blocks as MessageBlock[]);
        }
      } catch {
        /* first-load restore failure is non-fatal; user gets a fresh chat */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the active session whenever blocks change. Save is
  // fire-and-forget (the UI doesn't block on it) but the outcome is
  // surfaced as a small status pill in the header so silent failures
  // (DB off, backend not redeployed) don't leave the user wondering
  // why their history never appears in the sidebar.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (blocks.length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(() => {
      saveSession(sessionId, blocks)
        .then(() => {
          setSaveStatus("saved");
          setSidebarRefresh((n) => n + 1);
        })
        .catch((err) => {
          console.error("saveSession failed", err);
          if (err instanceof HistoryUnavailableError) setSaveStatus("off");
          else if (err instanceof HistoryEndpointMissingError) setSaveStatus("missing");
          else setSaveStatus("error");
        });
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [blocks, sessionId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [blocks, isSending]);

  const buildHistory = (): PMSAgentHistoryTurn[] => {
    const turns: PMSAgentHistoryTurn[] = [];
    for (const b of blocks) {
      if (b.kind === "user") {
        turns.push({ role: "user", content: b.text });
      } else if (b.kind === "assistant") {
        turns.push({ role: "assistant", content: b.response.reply });
      }
    }
    return turns.slice(-10);
  };

  const handleSend = async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || isSending) return;

    const history = buildHistory();
    setInputText("");
    setBlocks((prev) => [...prev, { kind: "user", text: trimmed }]);
    setIsSending(true);

    try {
      const response = await pmsApi.chatWithPMSAgent(trimmed, history, sessionId);
      setBlocks((prev) => [...prev, { kind: "assistant", response }]);
    } catch (err) {
      const msg =
        err instanceof PMSApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : "Unknown error";
      setBlocks((prev) => [
        ...prev,
        { kind: "error", message: msg, lastPrompt: trimmed },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleRetry = (lastPrompt: string) => handleSend(lastPrompt);

  /** Save a class to the user's shortlist on the backend (table:
   *  saved_pms). Two-step flow:
   *    1. POST with force=false → backend returns 200 (saved) or 409
   *       (already exists, here's the existing row's metadata).
   *    2. On 409, open the overwrite-confirm modal. If the user
   *       confirms, retry with force=true. */
  const handleSave = async (
    blockIdx: number,
    match: PMSAgentClassMatch,
    extras: {
      service: string | null;
      design_pressure_barg: number | null;
      design_temp_c: number | null;
    },
  ) => {
    const key = `${blockIdx}:${match.piping_class}`;
    if (savingKey) return;
    setSavingKey(key);
    const payload: SavePMSRequest = {
      piping_class: match.piping_class,
      rating: match.rating,
      material: match.material,
      corrosion_allowance: match.corrosion_allowance,
      service: extras.service || "General",
      design_pressure_barg: extras.design_pressure_barg,
      design_temp_c: extras.design_temp_c,
    };
    try {
      const outcome = await pmsApi.savePMS(payload);
      if (outcome.kind === "conflict") {
        // Keep savingKey set while the modal is open — when the user
        // confirms, performForceSave() resolves it. When the user
        // cancels, the modal's onOpenChange clears savingKey.
        setOverwritePrompt({
          key,
          payload,
          existing: outcome.existing,
          label: `${match.piping_class} · ${match.rating} · ${match.material} · CA ${match.corrosion_allowance}`,
        });
        return;
      }
      setSavedKeys((prev) => new Set(prev).add(key));
      toast.success(`Saved ${match.piping_class} to your shortlist`);
    } catch (err) {
      const msg =
        err instanceof PMSApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : "Save failed";
      toast.error(`Save failed: ${msg}`);
    } finally {
      // Don't clear savingKey while the modal is open — that's done
      // in the modal close handler so the button keeps showing the
      // spinner until the user decides.
      if (!overwritePrompt) setSavingKey(null);
    }
  };

  /** Retry the save with force=true after the user clicks "Overwrite"
   *  in the confirmation modal. */
  const performForceSave = async () => {
    if (!overwritePrompt) return;
    const { key, payload } = overwritePrompt;
    setOverwritePrompt(null);
    try {
      const outcome = await pmsApi.savePMS({ ...payload, force: true });
      if (outcome.kind === "saved") {
        setSavedKeys((prev) => new Set(prev).add(key));
        toast.success(`Overwrote saved ${payload.piping_class}`);
      } else {
        // Shouldn't happen with force=true, but keep the UX honest.
        toast.error("Save failed unexpectedly");
      }
    } catch (err) {
      const msg =
        err instanceof PMSApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : "Save failed";
      toast.error(`Save failed: ${msg}`);
    } finally {
      setSavingKey(null);
    }
  };

  /** Toggle the inline PMS preview for a class. When expanded, the full
   *  ReportPanel (banner + 4 tabs) renders below the card. */
  const handleTogglePreview = (
    blockIdx: number,
    match: PMSAgentClassMatch,
    extras: {
      service: string | null;
      design_pressure_barg: number | null;
      design_temp_c: number | null;
    },
  ) => {
    const key = `${blockIdx}:${match.piping_class}`;
    setExpandedPreviews((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = {
          request: {
            piping_class: match.piping_class,
            rating: match.rating,
            material: match.material,
            corrosion_allowance: match.corrosion_allowance,
            service: extras.service || "General",
          },
          design_pressure_barg: extras.design_pressure_barg,
          design_temp_c: extras.design_temp_c,
        };
      }
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(inputText);
    }
  };

  /** Start a fresh conversation (keeps past sessions in the sidebar). */
  const handleNewSession = () => {
    const id = newSessionId();
    setSessionId(id);
    setCurrentSessionId(id);
    setBlocks([]);
    setInputText("");
    setSelection({});
    setExpandedPreviews({});
    setSavedKeys(new Set());
    setSidebarOpen(false);
  };

  /** Load a past session from the sidebar into the chat view. */
  const handleLoadSession = async (id: string) => {
    if (id === sessionId) {
      setSidebarOpen(false);
      return;
    }
    try {
      const session = await getSession(id);
      if (!session) return;
      setSessionId(id);
      setCurrentSessionId(id);
      setBlocks((session.blocks as MessageBlock[]) || []);
      setSelection({});
      setExpandedPreviews({});
      setSavedKeys(new Set());
      setSidebarOpen(false);
    } catch (err) {
      console.error("loadSession failed", err);
    }
  };

  /** Invoked when the user deletes the currently-open session in the
   *  sidebar — we roll into a fresh chat. */
  const handleDeleteCurrent = () => {
    handleNewSession();
  };

  // ── Multi-select handlers ──────────────────────────────────────
  const toggleSelect = (blockIdx: number, pipingClass: string) => {
    setSelection((prev) => {
      const current = new Set(prev[blockIdx] ?? []);
      if (current.has(pipingClass)) {
        current.delete(pipingClass);
      } else {
        current.add(pipingClass);
      }
      return { ...prev, [blockIdx]: current };
    });
  };

  const toggleSelectAll = (blockIdx: number, classes: PMSAgentClassMatch[]) => {
    setSelection((prev) => {
      const current = prev[blockIdx] ?? new Set();
      const allSelected = classes.every((c) => current.has(c.piping_class));
      const next = allSelected
        ? new Set<string>()
        : new Set(classes.map((c) => c.piping_class));
      return { ...prev, [blockIdx]: next };
    });
  };

  // ── Download handlers ─────────────────────────────────────────
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

  const handleSingleDownload = async (
    blockIdx: number,
    match: PMSAgentClassMatch,
    extras?: {
      service?: string | null;
      design_pressure_barg?: number | null;
      design_temp_c?: number | null;
    },
  ) => {
    const key = `${blockIdx}:${match.piping_class}`;
    if (downloadingKey) return;
    setDownloadingKey(key);
    try {
      const req: PMSRequest = {
        piping_class: match.piping_class,
        rating: match.rating,
        material: match.material,
        corrosion_allowance: match.corrosion_allowance,
        service: extras?.service || "General",
        design_pressure_barg: extras?.design_pressure_barg ?? null,
        design_temp_c: extras?.design_temp_c ?? null,
      };
      const blob = await pmsApi.downloadPMSExcel(req);
      const rating = (match.rating || "").replace(/#/g, "").replace(/\s+/g, "_") || "NA";
      triggerBrowserDownload(blob, `PMS_${match.piping_class}_${rating}.xlsx`);
    } catch (err) {
      const msg =
        err instanceof PMSApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : "Download failed";
      setBlocks((prev) => [
        ...prev,
        { kind: "error", message: `Download failed: ${msg}`, lastPrompt: "" },
      ]);
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleBulkDownload = async (
    blockIdx: number,
    classes: PMSAgentClassMatch[],
    extras?: {
      service?: string | null;
      design_pressure_barg?: number | null;
      design_temp_c?: number | null;
    },
  ) => {
    const selected = selection[blockIdx] ?? new Set();
    const toDownload = classes.filter((c) => selected.has(c.piping_class));
    if (toDownload.length === 0 || bulkDownloadingIdx !== null) return;
    setBulkDownloadingIdx(blockIdx);
    try {
      const body: PMSRequest[] = toDownload.map((m) => ({
        piping_class: m.piping_class,
        rating: m.rating,
        material: m.material,
        corrosion_allowance: m.corrosion_allowance,
        service: extras?.service || "General",
        design_pressure_barg: extras?.design_pressure_barg ?? null,
        design_temp_c: extras?.design_temp_c ?? null,
      }));
      const blob = await pmsApi.downloadBulkPMSZip(body);
      triggerBrowserDownload(blob, `PMS_Bulk_${toDownload.length}_classes.zip`);
    } catch (err) {
      const msg =
        err instanceof PMSApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : "Bulk download failed";
      setBlocks((prev) => [
        ...prev,
        { kind: "error", message: `Bulk download failed: ${msg}`, lastPrompt: "" },
      ]);
    } finally {
      setBulkDownloadingIdx(null);
    }
  };

  return (
    // h-[calc(100vh-64px)] pins the page to the viewport minus the AppHeader,
    // so our internal scroll regions (messages, sidebar list) stay bounded and
    // the input bar stays glued to the bottom. The AppLayout's <main> has
    // overflow-y-auto — we prevent it from scrolling by sizing ourselves to fit.
    <div className="flex h-[calc(100vh-64px)] bg-white overflow-hidden">
      {/* Desktop sidebar — always mounted, full viewport height, slide-in via width */}
      <aside
        className={`hidden sm:block border-r border-gray-200 transition-[width,opacity] duration-200 overflow-hidden h-full flex-shrink-0 ${
          sidebarOpen ? "w-72 opacity-100" : "w-0 opacity-0"
        }`}
      >
        <div className="w-72 h-full">
          <PMSConversationSidebar
            currentSessionId={sessionId}
            onSelectSession={handleLoadSession}
            onNewSession={handleNewSession}
            onDeleteCurrent={handleDeleteCurrent}
            refreshTrigger={sidebarRefresh}
          />
        </div>
      </aside>

      {/* Mobile drawer — overlay when open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <PMSConversationSidebar
              currentSessionId={sessionId}
              onSelectSession={handleLoadSession}
              onNewSession={handleNewSession}
              onDeleteCurrent={handleDeleteCurrent}
              refreshTrigger={sidebarRefresh}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main chat column — h-full so the flex-col distributes vertical space */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b bg-white flex-shrink-0">
          {/* History toggle — visible always */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 flex-shrink-0"
            aria-label={sidebarOpen ? "Hide history" : "Show history"}
            title={sidebarOpen ? "Hide history" : "Show history"}
          >
            {sidebarOpen ? (
              <CloseIcon className="w-4 h-4" />
            ) : (
              <HistoryIcon className="w-4 h-4" />
            )}
          </button>

          <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-purple-600 flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg font-semibold truncate">
              PMS Generator — AI Agent
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Tell me the Rating, Material, and Corrosion Allowance you need —
              I'll find the matching classes and you can download one or all
              of them as Excel.
            </p>
          </div>
          <SaveStatusPill status={saveStatus} />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewSession}
            title="Start a new chat"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            New chat
          </Button>
        </div>

      {/* Messages area — fills remaining vertical space, scrolls internally */}
      <ScrollArea className="flex-1 min-h-0 px-3 sm:px-6" ref={scrollRef}>
        <div className="max-w-5xl mx-auto py-4 sm:py-6 space-y-4">
          {isEmpty && (
            <div className="text-center py-8 sm:py-12">
              <div className="inline-flex p-3 sm:p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-purple-50 mb-4 sm:mb-6">
                <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-amber-600" />
              </div>
              <h2 className="text-lg sm:text-xl font-semibold mb-2">
                Generate PMS sheets in one chat
              </h2>
              <p className="text-sm text-muted-foreground mb-6 sm:mb-8 max-w-md mx-auto px-2">
                Give me a <strong>rating</strong>, <strong>material</strong>,
                and <strong>corrosion allowance</strong> — or describe the
                service and I'll pick. Add a <strong>design pressure</strong>{" "}
                and <strong>temperature</strong> if you want an adequacy
                check too.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto px-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="text-left text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-700"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {blocks.map((block, i) => (
            <BlockRenderer
              key={i}
              blockIdx={i}
              block={block}
              selection={selection[i] ?? new Set()}
              expandedPreviews={expandedPreviews}
              savedKeys={savedKeys}
              savingKey={savingKey}
              downloadingKey={downloadingKey}
              bulkDownloading={bulkDownloadingIdx === i}
              onRetry={handleRetry}
              onQuickAsk={handleSend}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onSingleDownload={handleSingleDownload}
              onBulkDownload={handleBulkDownload}
              onTogglePreview={handleTogglePreview}
              onSave={handleSave}
            />
          ))}

          {isSending && (
            <div className="flex items-start gap-2 py-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-purple-600 flex-shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="flex items-center gap-2 bg-gray-50 rounded-2xl rounded-tl-md px-4 py-2.5 text-sm text-gray-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                <span>Thinking…</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

        {/* Input — pinned at bottom, never shrinks */}
        <div className="border-t bg-white px-3 sm:px-6 py-3 sm:py-4 flex-shrink-0">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-end gap-2 sm:gap-3">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about a piping class, material, or service…"
                rows={1}
                disabled={isSending}
                className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:bg-gray-50"
              />
              <button
                onClick={() => handleSend(inputText)}
                disabled={!inputText.trim() || isSending}
                className="p-3 rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* /main chat column */}

      {/* Overwrite confirmation — opened when the backend returns 409. */}
      <AlertDialog
        open={!!overwritePrompt}
        onOpenChange={(open) => {
          if (!open) {
            setOverwritePrompt(null);
            setSavingKey(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This PMS is already saved</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  <strong>{overwritePrompt?.label}</strong>
                </div>
                {overwritePrompt?.existing.updated_at && (
                  <div className="text-muted-foreground">
                    Last saved on{" "}
                    {new Date(
                      overwritePrompt.existing.updated_at * 1000,
                    ).toLocaleString()}
                  </div>
                )}
                <div>
                  Saving again will <strong>overwrite</strong> the previously
                  stored payload and design conditions. Continue?
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performForceSave}>
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Block renderer ────────────────────────────────────────────────
interface ExpandedPreviewEntry {
  request: PMSRequest;
  design_pressure_barg: number | null;
  design_temp_c: number | null;
}

interface BlockRendererProps {
  blockIdx: number;
  block: MessageBlock;
  selection: Set<string>;
  expandedPreviews: Record<string, ExpandedPreviewEntry>;
  savedKeys: Set<string>;
  savingKey: string | null;
  downloadingKey: string | null;
  bulkDownloading: boolean;
  onRetry: (lastPrompt: string) => void;
  onQuickAsk: (prompt: string) => void;
  onToggleSelect: (blockIdx: number, pipingClass: string) => void;
  onToggleSelectAll: (blockIdx: number, classes: PMSAgentClassMatch[]) => void;
  onSingleDownload: (
    blockIdx: number,
    match: PMSAgentClassMatch,
    extras?: {
      service?: string | null;
      design_pressure_barg?: number | null;
      design_temp_c?: number | null;
    },
  ) => void;
  onBulkDownload: (
    blockIdx: number,
    classes: PMSAgentClassMatch[],
    extras?: {
      service?: string | null;
      design_pressure_barg?: number | null;
      design_temp_c?: number | null;
    },
  ) => void;
  onTogglePreview: (
    blockIdx: number,
    match: PMSAgentClassMatch,
    extras: {
      service: string | null;
      design_pressure_barg: number | null;
      design_temp_c: number | null;
    },
  ) => void;
  onSave: (
    blockIdx: number,
    match: PMSAgentClassMatch,
    extras: {
      service: string | null;
      design_pressure_barg: number | null;
      design_temp_c: number | null;
    },
  ) => void;
}

function BlockRenderer({
  blockIdx,
  block,
  selection,
  expandedPreviews,
  savedKeys,
  savingKey,
  downloadingKey,
  bulkDownloading,
  onRetry,
  onQuickAsk,
  onToggleSelect,
  onToggleSelectAll,
  onSingleDownload,
  onBulkDownload,
  onTogglePreview,
  onSave,
}: BlockRendererProps) {
  if (block.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-amber-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%] sm:max-w-[75%] text-sm whitespace-pre-wrap">
          {block.text}
        </div>
      </div>
    );
  }

  if (block.kind === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
        <span>{block.message}</span>
        {block.lastPrompt && (
          <button
            onClick={() => onRetry(block.lastPrompt)}
            className="flex items-center gap-1.5 ml-4 px-3 py-1.5 text-xs font-medium bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retry
          </button>
        )}
      </div>
    );
  }

  // Assistant block
  const { response } = block;
  const {
    reply,
    interpreted,
    matched_classes,
    suggested_action,
    slots,
    field_suggestions,
    allow_bulk_download,
  } = response;

  // `extras` is used by Download Excel / Bulk ZIP to
  // carry the user-picked service + design point into the PMSRequest.
  // Prefer `slots.service` (what the user actively picked in chat)
  // over `suggested_action.service` — the latter is only populated on
  // single-match auto-open actions, so multi-match flows would
  // otherwise fall through to the "General" default and overwrite the
  // service value in the generated PMS.
  const extras = {
    service: slots.service || suggested_action.service,
    design_pressure_barg: suggested_action.design_pressure_barg,
    design_temp_c: suggested_action.design_temp_c,
  };

  return (
    <div className="space-y-3">
      {/* Assistant text bubble */}
      <div className="flex items-start gap-2">
        <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-purple-600 flex-shrink-0 mt-0.5">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1 bg-gray-50 rounded-2xl rounded-tl-md px-4 py-2.5 text-sm text-gray-800">
          <FormattedMarkdown text={reply} />
        </div>
      </div>

      {/* Slot progress pills — show Rating / Material / CA / Service filled state */}
      {(slots.rating || slots.material || slots.corrosion_allowance || slots.service || slots.missing.length > 0) && (
        <div className="ml-8 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground">Required:</span>
          <SlotPill label="Rating" value={slots.rating} />
          <SlotPill label="Material" value={slots.material} />
          <SlotPill label="CA" value={slots.corrosion_allowance} />
          <SlotPill label="Service" value={slots.service} />
        </div>
      )}

      {/* Field suggestions — "did you mean …?" chips */}
      {field_suggestions.length > 0 && (
        <div className="ml-8 space-y-2">
          {field_suggestions.map((fs) => (
            <FieldSuggestionBlock
              key={fs.field}
              suggestion={fs}
              onPick={(value) =>
                onQuickAsk(`Use ${prettyFieldName(fs.field)} = ${value}`)
              }
            />
          ))}
        </div>
      )}

      {/* Interpreted chips — what the regex parser extracted */}
      {hasInterpretedFilters(interpreted) && (
        <div className="ml-8 flex flex-wrap gap-1.5 items-center">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Understood:</span>
          {interpreted.piping_class && (
            <Badge variant="secondary">{interpreted.piping_class}</Badge>
          )}
          {interpreted.rating && (
            <Badge variant="outline">{interpreted.rating}</Badge>
          )}
          {interpreted.material && (
            <Badge variant="outline">{interpreted.material}</Badge>
          )}
          {interpreted.corrosion_allowance && (
            <Badge variant="outline">CA: {interpreted.corrosion_allowance}</Badge>
          )}
          {interpreted.service && (
            <Badge variant="outline">{interpreted.service}</Badge>
          )}
          {interpreted.design_temp_c != null && (
            <Badge variant="outline">{interpreted.design_temp_c} °C</Badge>
          )}
          {interpreted.design_pressure_barg != null && (
            <Badge variant="outline">{interpreted.design_pressure_barg} barg</Badge>
          )}
        </div>
      )}

      {/* Narrow-down picker — when the match list is long (>6), show chips
          for the dimension with the most variance so the user can refine.
          Typically that's Material when they've already fixed Rating + CA.
          Clicking a chip re-asks with the specific sub-value. */}
      {matched_classes.length > 6 &&
        (() => {
          const narrow = getNarrowDownSuggestion(matched_classes, slots);
          if (!narrow) return null;
          return (
            <div className="ml-8">
              <NarrowDownPicker
                field={narrow.field}
                values={narrow.values}
                totalCount={matched_classes.length}
                onPick={(value) =>
                  onQuickAsk(buildSlotPickPrompt(narrow.field, value))
                }
              />
            </div>
          );
        })()}

      {/* Multi-select action bar + class cards */}
      {matched_classes.length > 0 && (
        <div className="ml-8 space-y-2">
          {/* Action bar — only when bulk download is allowed */}
          {allow_bulk_download && matched_classes.length > 1 && (
            <SelectActionBar
              totalCount={matched_classes.length}
              selectedCount={selection.size}
              bulkDownloading={bulkDownloading}
              allSelected={
                matched_classes.length > 0 &&
                matched_classes.every((c) => selection.has(c.piping_class))
              }
              onSelectAll={() => onToggleSelectAll(blockIdx, matched_classes)}
              onBulkDownload={() =>
                onBulkDownload(blockIdx, matched_classes, extras)
              }
            />
          )}

          {/* Class cards — each card may have an inline preview below */}
          {matched_classes.map((m) => {
            const cardKey = `${blockIdx}:${m.piping_class}`;
            const preview = expandedPreviews[cardKey];
            return (
              <div key={m.piping_class} className="space-y-2">
                <ClassMatchCard
                  match={m}
                  extras={extras}
                  selected={selection.has(m.piping_class)}
                  downloading={downloadingKey === cardKey}
                  expanded={!!preview}
                  saved={savedKeys.has(cardKey)}
                  saving={savingKey === cardKey}
                  onToggleSelect={() => onToggleSelect(blockIdx, m.piping_class)}
                  onDownload={() => onSingleDownload(blockIdx, m, extras)}
                  onTogglePreview={() =>
                    onTogglePreview(blockIdx, m, {
                      service: extras.service,
                      design_pressure_barg: extras.design_pressure_barg,
                      design_temp_c: extras.design_temp_c,
                    })
                  }
                  onSave={() =>
                    onSave(blockIdx, m, {
                      service: extras.service,
                      design_pressure_barg: extras.design_pressure_barg,
                      design_temp_c: extras.design_temp_c,
                    })
                  }
                  highlighted={
                    suggested_action.type === "open_generator" &&
                    suggested_action.piping_class === m.piping_class
                  }
                  allowMultiSelect={
                    allow_bulk_download && matched_classes.length > 1
                  }
                />
                {preview && (
                  <InlinePMSPreview
                    request={preview.request}
                    initialDesignPbarg={preview.design_pressure_barg}
                    initialDesignTc={preview.design_temp_c}
                    onClose={() =>
                      onTogglePreview(blockIdx, m, {
                        service: extras.service,
                        design_pressure_barg: extras.design_pressure_barg,
                        design_temp_c: extras.design_temp_c,
                      })
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Missing-field picker — rendered when the user still owes us one or
          more required slots AND no concrete matches came back. We check
          each slot's value directly instead of relying on `slots.missing`
          because some backend versions don't populate that array; the
          individual value fields (slots.rating / material / ca) are the
          source of truth.

          Clicking a chip sends a structured "Rating: 150#" style prompt
          the backend regex picks up cleanly. */}
      {matched_classes.length === 0 &&
        field_suggestions.length === 0 &&
        !slots.complete &&
        (!slots.rating ||
          !slots.material ||
          !slots.corrosion_allowance ||
          !slots.service) && (
          <div className="ml-8 space-y-2">
            {!slots.rating && (
              <MissingFieldPicker
                field="rating"
                values={response.available_values.rating ?? []}
                onPick={(value) =>
                  onQuickAsk(buildSlotPickPrompt("rating", value))
                }
              />
            )}
            {!slots.material && (
              <MissingFieldPicker
                field="material"
                values={response.available_values.material ?? []}
                onPick={(value) =>
                  onQuickAsk(buildSlotPickPrompt("material", value))
                }
              />
            )}
            {!slots.corrosion_allowance && (
              <MissingFieldPicker
                field="corrosion_allowance"
                values={response.available_values.corrosion_allowance ?? []}
                onPick={(value) =>
                  onQuickAsk(buildSlotPickPrompt("corrosion_allowance", value))
                }
              />
            )}
            {!slots.service && (
              <MissingFieldPicker
                field="service"
                values={response.available_values.service ?? []}
                onPick={(value) =>
                  onQuickAsk(buildSlotPickPrompt("service", value))
                }
              />
            )}
          </div>
        )}

      {/* Zero-match notice — slots are complete but no matching class in
          the catalogue. Show a quiet one-liner so the user knows the
          request was understood but nothing matched, rather than random
          "try these instead" chips that aren't tied to their query. */}
      {matched_classes.length === 0 &&
        field_suggestions.length === 0 &&
        slots.complete && (
          <div className="ml-8 text-xs text-muted-foreground italic">
            No piping class in the catalogue matches{" "}
            <span className="font-medium">
              {slots.rating} · {slots.material} · CA {slots.corrosion_allowance}
            </span>
            . Try a different combination.
          </div>
        )}
    </div>
  );
}

// ── Missing-field picker: clickable chips for each canonical value ────
// Rendered once per missing slot (Rating / Material / CA). The chip list
// comes from the backend's available_values — the catalogue source of
// truth — so we never show a value that won't resolve to a real class.
function MissingFieldPicker({
  field,
  values,
  onPick,
}: {
  field: "rating" | "material" | "corrosion_allowance" | "service";
  values: string[];
  onPick: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-amber-900 mb-1.5">
            Pick a <span className="font-semibold">{prettyFieldName(field)}</span>{" "}
            <span className="text-amber-700/80">
              — or type it in the box below.
            </span>
          </div>
          {values.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {values.map((v) => (
                <button
                  key={v}
                  onClick={() => onPick(v)}
                  className="text-xs px-2.5 py-1 rounded-full bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 hover:border-amber-400 transition-colors font-medium"
                >
                  {v}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-amber-700/80 italic">
              (No suggestions available — type the value directly.)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Build the prompt string for a slot-pick click. The format matters: it
 *  has to be something the backend's regex parser will parse unambiguously.
 *  "Rating: 150#" / "Material: SS316L" / "CA: 3 mm" / "CA: NIL" /
 *  "Service: General" all work. */
function buildSlotPickPrompt(
  field: "rating" | "material" | "corrosion_allowance" | "service",
  value: string,
): string {
  if (field === "rating") return `Rating: ${value}`;
  if (field === "material") return `Material: ${value}`;
  if (field === "corrosion_allowance") return `CA: ${value}`;
  return `Service: ${value}`;
}

// ── Narrow-down picker: chips to refine a too-long result list ─────
// Shown when the backend returned >6 class cards. We find the dimension
// (rating / material / CA) with the MOST unique values in the result
// set and surface those as chips — clicking one narrows the search to
// that specific sub-value. Material is by far the most common varying
// axis (e.g. the user picked 150# + 3mm and got CS + CS NACE + LTCS
// + LTCS NACE + GALV + Epoxy Lined all at once).
function NarrowDownPicker({
  field,
  values,
  totalCount,
  onPick,
}: {
  field: "rating" | "material" | "corrosion_allowance";
  values: string[];
  totalCount: number;
  onPick: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2.5 mb-2">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-indigo-900 mb-1.5">
            <span className="font-semibold">{totalCount} matches</span> —
            narrow by <span className="font-semibold">{prettyFieldName(field)}</span>:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {values.map((v) => (
              <button
                key={v}
                onClick={() => onPick(v)}
                className="text-xs px-2.5 py-1 rounded-full bg-white border border-indigo-300 text-indigo-900 hover:bg-indigo-100 hover:border-indigo-400 transition-colors font-medium"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pick the best dimension to narrow the result set on. Returns the field
 *  whose values vary the MOST across `matches`, along with the unique
 *  sorted values. Skips fields that are already uniform (everyone has
 *  the same rating, say) or already pinned by a filled slot (because
 *  re-picking the same slot value is a no-op). */
function getNarrowDownSuggestion(
  matches: PMSAgentClassMatch[],
  slots: PMSAgentResponse["slots"],
): {
  field: "rating" | "material" | "corrosion_allowance";
  values: string[];
} | null {
  if (matches.length <= 6) return null;

  const uniq = (key: keyof PMSAgentClassMatch): string[] =>
    Array.from(new Set(matches.map((m) => String(m[key])))).sort();

  const candidates: {
    field: "rating" | "material" | "corrosion_allowance";
    values: string[];
    pinned: boolean;
  }[] = [
    { field: "material", values: uniq("material"), pinned: !!slots.material },
    { field: "rating", values: uniq("rating"), pinned: !!slots.rating },
    {
      field: "corrosion_allowance",
      values: uniq("corrosion_allowance"),
      pinned: !!slots.corrosion_allowance,
    },
  ];

  // Prefer an UNPINNED dimension with variance. If all remaining slots
  // are pinned (e.g. user already filled all 3 but results still vary —
  // can happen with fuzzy backends), fall back to the highest-variance
  // pinned one so the user can still narrow.
  const unpinned = candidates
    .filter((c) => !c.pinned && c.values.length > 1)
    .sort((a, b) => b.values.length - a.values.length);
  if (unpinned.length > 0) {
    return { field: unpinned[0].field, values: unpinned[0].values };
  }
  const pinnedVariant = candidates
    .filter((c) => c.values.length > 1)
    .sort((a, b) => b.values.length - a.values.length);
  if (pinnedVariant.length > 0) {
    return { field: pinnedVariant[0].field, values: pinnedVariant[0].values };
  }
  return null;
}

// ── Slot progress pill (one per required field) ───────────────────
function SlotPill({ label, value }: { label: string; value: string | null }) {
  const filled = !!value;
  return (
    <div
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
        filled
          ? "bg-green-50 border-green-200 text-green-800"
          : "bg-gray-50 border-gray-200 text-gray-500"
      }`}
      title={filled ? `${label}: ${value}` : `${label} not provided yet`}
    >
      {filled ? (
        <CircleCheck className="w-3 h-3" />
      ) : (
        <CircleDashed className="w-3 h-3" />
      )}
      <span className="font-medium">{label}</span>
      {filled && <span className="text-green-700">= {value}</span>}
    </div>
  );
}

// ── Did-you-mean chips for one field that didn't match ────────────
function FieldSuggestionBlock({
  suggestion,
  onPick,
}: {
  suggestion: PMSAgentFieldSuggestion;
  onPick: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Lightbulb className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-amber-800 mb-1.5">
            <span className="font-medium">
              {prettyFieldName(suggestion.field)}
            </span>{" "}
            = <span className="italic">"{suggestion.provided}"</span> isn't in
            the catalogue.
            {suggestion.suggestions.length > 0 ? " Did you mean:" : ""}
          </div>
          {suggestion.suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {suggestion.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => onPick(s)}
                  className="text-xs px-2.5 py-1 rounded-full bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-amber-700">
              No close match found. Try a different spelling or check the
              canonical list.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Multi-select action bar ───────────────────────────────────────
function SelectActionBar({
  totalCount,
  selectedCount,
  bulkDownloading,
  allSelected,
  onSelectAll,
  onBulkDownload,
}: {
  totalCount: number;
  selectedCount: number;
  bulkDownloading: boolean;
  allSelected: boolean;
  onSelectAll: () => void;
  onBulkDownload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onSelectAll}
          className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
        />
        <span className="font-medium text-gray-800">Select all</span>
        <span className="text-xs text-muted-foreground">
          ({selectedCount}/{totalCount})
        </span>
      </label>

      <div className="flex-1" />

      <Button
        size="sm"
        disabled={selectedCount === 0 || bulkDownloading}
        onClick={onBulkDownload}
        className="bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
      >
        {bulkDownloading ? (
          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
        ) : (
          <Archive className="w-4 h-4 mr-1.5" />
        )}
        Download selected {selectedCount > 0 ? `(${selectedCount})` : ""} as ZIP
      </Button>
    </div>
  );
}

// ── Class-match card ──────────────────────────────────────────────
function ClassMatchCard({
  match,
  selected,
  downloading,
  expanded,
  saved,
  saving,
  onToggleSelect,
  onDownload,
  onTogglePreview,
  onSave,
  highlighted,
  allowMultiSelect,
}: {
  match: PMSAgentClassMatch;
  extras?: {
    service?: string | null;
    design_pressure_barg?: number | null;
    design_temp_c?: number | null;
  };
  selected: boolean;
  downloading: boolean;
  expanded: boolean;
  saved: boolean;
  saving: boolean;
  onToggleSelect: () => void;
  onDownload: () => void;
  onTogglePreview: () => void;
  onSave: () => void;
  highlighted?: boolean;
  allowMultiSelect: boolean;
}) {
  return (
    <div
      className={`w-full text-left rounded-xl border p-3 sm:p-4 transition-all ${
        highlighted
          ? "border-amber-300 bg-amber-50/40 shadow-sm"
          : selected
            ? "border-amber-400 bg-amber-50/20"
            : "border-gray-200 hover:border-amber-300"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox (only when bulk-select is available) */}
        {allowMultiSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="mt-1 w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {/* Card body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Badge className="font-mono text-sm" variant="secondary">
              {match.piping_class}
            </Badge>
            <span className="text-sm font-medium">{match.rating}</span>
            <span className="text-sm text-muted-foreground">·</span>
            <span className="text-sm">{match.material}</span>
            <span className="text-sm text-muted-foreground">·</span>
            <span className="text-sm">CA {match.corrosion_allowance}</span>
            {highlighted && (
              <div className="flex items-center gap-1 text-xs font-medium text-amber-600 ml-auto">
                <Zap className="w-3.5 h-3.5" />
                <span>Suggested</span>
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground mb-2.5">
            P-T: {match.pt_preview}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={downloading}
              onClick={onDownload}
              className="h-7 text-xs"
            >
              {downloading ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 mr-1" />
              )}
              Download Excel
            </Button>
            <Button
              size="sm"
              variant={saved ? "secondary" : "outline"}
              onClick={onSave}
              disabled={saving}
              className={
                "h-7 text-xs " +
                (saved
                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-200"
                  : "text-emerald-700 hover:bg-emerald-50")
              }
              title={saved ? "Already saved (click to refresh)" : "Save to shortlist"}
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : saved ? (
                <BookmarkCheck className="w-3.5 h-3.5 mr-1" />
              ) : (
                <Bookmark className="w-3.5 h-3.5 mr-1" />
              )}
              {saved ? "Saved" : "Save"}
            </Button>
            <Button
              size="sm"
              variant={expanded ? "secondary" : "ghost"}
              onClick={onTogglePreview}
              className="h-7 text-xs text-amber-700 hover:bg-amber-50"
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 mr-1" />
                  Hide Details
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 mr-1" />
                  View Details
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Minimal markdown renderer: **bold**, `code`, and bullet lists ──
function FormattedMarkdown({ text }: { text: string }) {
  // Split into paragraphs; a "paragraph" is anything between blank lines
  const paragraphs = text.split(/\n{2,}/);

  return (
    <div className="space-y-2">
      {paragraphs.map((para, pi) => {
        const lines = para.split("\n");
        // If every non-empty line starts with a bullet/number marker, render as list
        const isList =
          lines.every((l) => !l.trim() || /^\s*(?:[-*•]|\d+\.)\s+/.test(l)) &&
          lines.some((l) => /^\s*(?:[-*•]|\d+\.)\s+/.test(l));

        if (isList) {
          return (
            <ul key={pi} className="list-disc pl-5 space-y-1">
              {lines
                .filter((l) => l.trim())
                .map((l, li) => (
                  <li key={li}>
                    <InlineFormatted
                      text={l.replace(/^\s*(?:[-*•]|\d+\.)\s+/, "")}
                    />
                  </li>
                ))}
            </ul>
          );
        }
        return (
          <p key={pi} className="whitespace-pre-wrap">
            <InlineFormatted text={para} />
          </p>
        );
      })}
    </div>
  );
}

function InlineFormatted({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="px-1 py-0.5 bg-gray-200/60 rounded text-xs font-mono"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────
function hasInterpretedFilters(p: PMSAgentResponse["interpreted"]): boolean {
  return Boolean(
    p.piping_class ||
      p.rating ||
      p.material ||
      p.corrosion_allowance ||
      p.service ||
      p.design_temp_c != null ||
      p.design_pressure_barg != null,
  );
}

function prettyFieldName(
  f: "rating" | "material" | "corrosion_allowance" | "service",
): string {
  if (f === "rating") return "Pressure Rating";
  if (f === "material") return "Material";
  if (f === "corrosion_allowance") return "Corrosion Allowance";
  return "Service Description";
}

/** Tiny status indicator for the auto-save lifecycle. Silent on "idle"
 *  (nothing to report) and "saving" (avoid flicker on every keystroke);
 *  shows a brief checkmark on success and a visible warning when the
 *  server can't persist — so the user never sees an empty sidebar
 *  without knowing why. */
function SaveStatusPill({
  status,
}: {
  status: "idle" | "saving" | "saved" | "off" | "missing" | "error";
}) {
  if (status === "idle" || status === "saving") return null;

  if (status === "saved") {
    return (
      <span
        className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 flex items-center gap-1"
        title="Saved to server"
      >
        <CircleCheck className="w-3 h-3" />
        Saved
      </span>
    );
  }

  const label =
    status === "off"
      ? "History sync off"
      : status === "missing"
        ? "Server not updated"
        : "Save failed";
  const tip =
    status === "off"
      ? "The PMS server's DATABASE_URL isn't configured. Chats won't persist — ask ops to set it on Render."
      : status === "missing"
        ? "The pms-generator backend doesn't have the new history endpoints yet. Redeploy it."
        : "Couldn't persist this chat. Check the network / server logs.";
  return (
    <span
      className="text-[11px] text-amber-800 bg-amber-50 border border-amber-300 rounded-full px-2 py-0.5 flex items-center gap-1 cursor-help"
      title={tip}
    >
      <Lightbulb className="w-3 h-3" />
      {label}
    </span>
  );
}
