/**
 * AgentChatPage — Chat-first UI for the Valve Datasheet Agent.
 *
 * Features:
 * - Conversation sidebar with persistence (load/save/rename/delete)
 * - Streaming text responses (SSE)
 * - Collapsible thinking blocks
 * - Tool activity indicators with status messages
 * - Suggestion cards (clickable)
 * - Validation cards (green/red)
 * - Datasheet cards (with download)
 * - Retry button on errors
 * - Token usage display
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Send, StopCircle, Sparkles, Loader2, ChevronDown, ChevronRight,
  Wrench, PanelLeftClose, PanelLeft, RotateCcw, Zap, X,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SuggestionCard, SuggestionItem } from "@/components/agent/SuggestionCard";
import { ValidationCard } from "@/components/agent/ValidationCard";
import { DatasheetCard } from "@/components/agent/DatasheetCard";
import { AgentTextBlock } from "@/components/agent/AgentTextBlock";
import { ConversationSidebar } from "@/components/agent/ConversationSidebar";
import {
  streamChat, AgentEvent, ChatMessage,
  getSession,
} from "@/services/agentApi";

// ── Message block types ──────────────────────────────────────────────────────

interface UserBlock { kind: "user"; text: string }
interface TextBlock { kind: "text"; text: string }
interface ThinkingBlock { kind: "thinking"; text: string; collapsed: boolean }
interface ToolCallBlock { kind: "tool_call"; name: string; input: Record<string, any>; done: boolean }
interface SuggestionBlock { kind: "suggestion"; suggestions: SuggestionItem[] }
interface ValidationBlock { kind: "validation"; isValid: boolean; errors: string[]; warnings: string[]; suggestions: SuggestionItem[] }
interface DatasheetBlock { kind: "datasheet"; vdsCode: string; data: Record<string, string>; fieldSources?: Record<string, string>; fieldSourcesLinks?: Record<string, string>; fieldSourcesQuotes?: Record<string, string>; fieldSourceValues?: Record<string, string>; fieldJustifications?: Record<string, string>; fieldPmsPdfSources?: Record<string, string>; fieldPmsPdfLinks?: Record<string, string>; completionPct: number; validationErrors?: string[]; validationWarnings?: string[]; projectName?: string; docNumber?: string; revision?: string }
interface ErrorBlock { kind: "error"; message: string; retryable?: boolean }
interface StatusBlock { kind: "status"; message: string; phase: string }

type MessageBlock =
  | UserBlock | TextBlock | ThinkingBlock | ToolCallBlock
  | SuggestionBlock | ValidationBlock | DatasheetBlock
  | ErrorBlock | StatusBlock;

// When a datasheet event arrives for an existing vdsCode, remove the old
// card and append the new one at the end of the chat. That way the updated
// card lands right below the latest message instead of staying anchored up
// in its original position — the user doesn't have to scroll back to find
// what changed. Combined with the existing scroll-to-bottom effect, the
// updated card is always visible after an edit.
function upsertDatasheet(blocks: MessageBlock[], incoming: DatasheetBlock): MessageBlock[] {
  const idx = blocks.findIndex(
    (b) => b.kind === "datasheet" && (b as DatasheetBlock).vdsCode === incoming.vdsCode,
  );
  if (idx === -1) return [...blocks, incoming];
  const without = blocks.slice(0, idx).concat(blocks.slice(idx + 1));
  return [...without, incoming];
}

// ── Quick-start suggestions ──────────────────────────────────────────────────

const STARTER_PROMPTS = [
  "Generate datasheet for size range \"2\" ball valve, class 150, carbon steel, RF ends, oil service",
  "Create valve sheet for size range \"6\" gate valve, class 300, carbon steel, flanged ends, sour service (NACE)",
  "Build datasheet for size range \"4\" check valve, class 150, carbon steel, RF ends, water service",
  "Generate sheet for size range \"1/2\" needle valve, class 900, SS316, RTJ ends, high pressure gas service",
  "Create DBB valve datasheet for size range \"2\", class 600, carbon steel, RF ends, hydrocarbon service",
];

// ── Rebuild blocks from session (restores suggestion/validation/datasheet cards) ──

function rebuildBlocksFromSession(session: any): { blocks: MessageBlock[]; messages: ChatMessage[] } {
  const blocks: MessageBlock[] = [];
  const messages: ChatMessage[] = [];
  const uiEvents: { type: string; data: any; turn: number }[] = session.metadata?.ui_events || [];

  // Group UI events by the message index (turn) they follow
  const eventsByTurn: Record<number, { type: string; data: any }[]> = {};
  for (const evt of uiEvents) {
    const turn = evt.turn ?? 0;
    if (!eventsByTurn[turn]) eventsByTurn[turn] = [];
    eventsByTurn[turn].push(evt);
  }

  let msgIndex = 0;
  for (const msg of session.messages) {
    const role = (msg as any).role;
    const content = (msg as any).content;
    if (!role || !content) continue;

    messages.push({ role, content });

    if (role === "user") {
      blocks.push({ kind: "user", text: content });
    } else if (role === "assistant") {
      // Insert UI events that belong BEFORE this assistant text (same turn index)
      const turnEvents = eventsByTurn[msgIndex] || [];
      for (const evt of turnEvents) {
        if (evt.type === "suggestion" && evt.data?.suggestions) {
          blocks.push({ kind: "suggestion", suggestions: evt.data.suggestions });
        } else if (evt.type === "validation") {
          blocks.push({
            kind: "validation",
            isValid: evt.data.is_valid,
            errors: evt.data.errors || [],
            warnings: evt.data.warnings || [],
            suggestions: (evt.data.suggestions || []).map((s: any) => ({
              type: s.type || "fix",
              title: s.title,
              description: s.description,
              action: s.action || {},
            })),
          });
        } else if (evt.type === "datasheet" && evt.data) {
          // Find most recent validation block to attach errors/warnings
          let valErrors: string[] | undefined;
          let valWarnings: string[] | undefined;
          for (let j = blocks.length - 1; j >= 0; j--) {
            if (blocks[j].kind === "validation") {
              const vb = blocks[j] as ValidationBlock;
              valErrors = vb.errors.length > 0 ? vb.errors : undefined;
              valWarnings = vb.warnings.length > 0 ? vb.warnings : undefined;
              break;
            }
          }
          const next = upsertDatasheet(blocks, {
            kind: "datasheet",
            vdsCode: evt.data.vds_code,
            data: evt.data.data || {},
            fieldSources: evt.data.field_sources || {},
            fieldSourcesLinks: evt.data.field_sources_links || {},
            fieldSourcesQuotes: evt.data.field_sources_quotes || {},
            fieldSourceValues: evt.data.field_source_values || {},
            fieldJustifications: evt.data.field_justifications || {},
            fieldPmsPdfSources: evt.data.field_pms_pdf_sources || {},
            fieldPmsPdfLinks: evt.data.field_pms_pdf_links || {},
            completionPct: evt.data.completion_pct || 0,
            validationErrors: valErrors,
            validationWarnings: valWarnings,
            projectName: evt.data.project_name,
            docNumber: evt.data.doc_number,
            revision: evt.data.revision,
          });
          blocks.length = 0;
          blocks.push(...next);
        }
      }
      blocks.push({ kind: "text", text: content });
    }
    msgIndex++;
  }

  return { blocks, messages };
}

// ── Component ────────────────────────────────────────────────────────────────

const SESSION_STORAGE_KEY = "valve_agent_session_id";

export default function AgentChatPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [blocks, setBlocks] = useState<MessageBlock[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(() => {
    // Restore session from sessionStorage so it survives navigation
    return sessionStorage.getItem(SESSION_STORAGE_KEY) || crypto.randomUUID().slice(0, 16);
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  const [tokenUsage, setTokenUsage] = useState({ input: 0, output: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const lastUserMsgRef = useRef<string>("");
  const hasRestoredRef = useRef(false);

  // Persist sessionId to sessionStorage (survives navigation, not tab close)
  useEffect(() => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }, [sessionId]);

  // Auto-restore session on mount (when returning from another page)
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const savedId = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (savedId && blocks.length === 0) {
      getSession(savedId).then((session) => {
        if (session && session.messages && session.messages.length > 0) {
          const { blocks: restoredBlocks, messages: restoredMessages } = rebuildBlocksFromSession(session);
          setBlocks(restoredBlocks);
          messagesRef.current = restoredMessages;

          if (session.metadata?.total_input_tokens) {
            setTokenUsage({
              input: session.metadata.total_input_tokens || 0,
              output: session.metadata.total_output_tokens || 0,
            });
          }
        }
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track whether user has manually scrolled up during streaming
  const userScrolledUpRef = useRef(false);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // Auto-scroll to bottom on new blocks or streaming updates
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Listen for user scroll events to detect manual scroll-up
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (!isNearBottom()) {
        userScrolledUpRef.current = true;
      } else {
        userScrolledUpRef.current = false;
      }
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [isNearBottom]);

  // Reset scroll lock when user sends a new message
  useEffect(() => {
    if (isStreaming) return;
    userScrolledUpRef.current = false;
  }, [blocks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!userScrolledUpRef.current) scrollToBottom();
  }, [blocks, scrollToBottom]);

  // Also scroll during streaming text updates — but only if user hasn't scrolled up
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => {
      if (!userScrolledUpRef.current) scrollToBottom();
    }, 100);
    return () => clearInterval(id);
  }, [isStreaming, scrollToBottom]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    }
  }, [inputText]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMsg = text.trim();
      setInputText("");
      setIsStreaming(true);
      lastUserMsgRef.current = userMsg;

      setBlocks((prev) => [...prev, { kind: "user", text: userMsg }]);

      messagesRef.current = [
        ...messagesRef.current,
        { role: "user", content: userMsg },
      ];

      let assistantText = "";

      const controller = streamChat(
        messagesRef.current,
        sessionId,
        (event: AgentEvent) => {
          switch (event.type) {
            case "status":
              setBlocks((prev) => {
                const last = prev[prev.length - 1];
                if (last?.kind === "status") {
                  return [...prev.slice(0, -1), { kind: "status", message: event.data.message, phase: event.data.phase }];
                }
                return [...prev, { kind: "status", message: event.data.message, phase: event.data.phase }];
              });
              break;

            case "thinking":
              setBlocks((prev) => {
                const filtered = prev.filter((b) => b.kind !== "status");
                const last = filtered[filtered.length - 1];
                if (last?.kind === "thinking") {
                  return [
                    ...filtered.slice(0, -1),
                    { ...last, text: last.text + (event.data.text || "") },
                  ];
                }
                return [...filtered, { kind: "thinking", text: event.data.text || "", collapsed: true }];
              });
              break;

            case "text":
              assistantText += event.data.text || "";
              setBlocks((prev) => {
                const filtered = prev.filter((b) => b.kind !== "status");
                const last = filtered[filtered.length - 1];
                if (last?.kind === "text") {
                  return [
                    ...filtered.slice(0, -1),
                    { kind: "text", text: last.text + (event.data.text || "") },
                  ];
                }
                return [...filtered, { kind: "text", text: event.data.text || "" }];
              });
              break;

            case "tool_call":
              setBlocks((prev) => {
                const filtered = prev.filter((b) => b.kind !== "status");
                return [
                  ...filtered,
                  { kind: "tool_call", name: event.data.name, input: event.data.input, done: false },
                ];
              });
              break;

            case "tool_result":
              setBlocks((prev) => {
                const idx = prev.findLastIndex(
                  (b) => b.kind === "tool_call" && (b as ToolCallBlock).name === event.data.name && !(b as ToolCallBlock).done,
                );
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = { ...(updated[idx] as ToolCallBlock), done: true };
                  return updated;
                }
                return prev;
              });
              break;

            case "suggestion":
              setBlocks((prev) => [
                ...prev,
                { kind: "suggestion", suggestions: event.data.suggestions || [] },
              ]);
              break;

            case "validation":
              setBlocks((prev) => {
                const errors = [
                  ...(event.data.errors || []),
                  ...(event.data.spec_notes || []),
                ];
                return [
                  ...prev,
                  {
                    kind: "validation",
                    isValid: event.data.is_valid,
                    errors,
                    warnings: event.data.warnings || [],
                    suggestions: (event.data.suggestions || []).map((s: any) => ({
                      type: s.type || "fix",
                      title: s.title,
                      description: s.description,
                      action: s.action || {},
                    })),
                  },
                ];
              });
              break;

            case "datasheet":
              setBlocks((prev) => {
                // Find the most recent validation block to attach its errors/warnings
                let valErrors: string[] | undefined;
                let valWarnings: string[] | undefined;
                for (let j = prev.length - 1; j >= 0; j--) {
                  if (prev[j].kind === "validation") {
                    const vb = prev[j] as ValidationBlock;
                    valErrors = vb.errors.length > 0 ? vb.errors : undefined;
                    valWarnings = vb.warnings.length > 0 ? vb.warnings : undefined;
                    break;
                  }
                }
                return upsertDatasheet(prev, {
                  kind: "datasheet",
                  vdsCode: event.data.vds_code,
                  data: event.data.data || {},
                  fieldSources: event.data.field_sources || {},
                  fieldSourcesLinks: event.data.field_sources_links || {},
                  fieldSourcesQuotes: event.data.field_sources_quotes || {},
                  fieldSourceValues: event.data.field_source_values || {},
                  fieldJustifications: event.data.field_justifications || {},
                  fieldPmsPdfSources: event.data.field_pms_pdf_sources || {},
                  fieldPmsPdfLinks: event.data.field_pms_pdf_links || {},
                  completionPct: event.data.completion_pct || 0,
                  validationErrors: valErrors,
                  validationWarnings: valWarnings,
                  projectName: event.data.project_name,
                  docNumber: event.data.doc_number,
                  revision: event.data.revision,
                });
              });
              break;

            case "error":
              setBlocks((prev) => {
                const filtered = prev.filter((b) => b.kind !== "status");
                return [
                  ...filtered,
                  { kind: "error", message: event.data.message || "Unknown error", retryable: event.data.retryable },
                ];
              });
              break;

            case "done":
              if (assistantText) {
                messagesRef.current = [
                  ...messagesRef.current,
                  { role: "assistant", content: assistantText },
                ];
              }
              if (event.data.input_tokens || event.data.output_tokens) {
                setTokenUsage((prev) => ({
                  input: prev.input + (event.data.input_tokens || 0),
                  output: prev.output + (event.data.output_tokens || 0),
                }));
              }
              setIsStreaming(false);
              // Refresh sidebar to show updated session
              setSidebarRefresh((n) => n + 1);
              break;
          }
        },
        (error: string) => {
          setBlocks((prev) => [...prev, { kind: "error", message: error, retryable: true }]);
          setIsStreaming(false);
        },
      );

      abortRef.current = controller;
    },
    [isStreaming, sessionId],
  );

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const handleRetry = () => {
    // Remove the last error block and re-send the last user message
    setBlocks((prev) => {
      const idx = prev.findLastIndex((b) => b.kind === "error");
      if (idx >= 0) return [...prev.slice(0, idx)];
      return prev;
    });
    // Remove the last user message from history (it will be re-added by sendMessage)
    if (messagesRef.current.length > 0 && messagesRef.current[messagesRef.current.length - 1].role === "user") {
      messagesRef.current = messagesRef.current.slice(0, -1);
    }
    if (lastUserMsgRef.current) {
      sendMessage(lastUserMsgRef.current);
    }
  };

  const handleSuggestionSelect = (s: SuggestionItem) => {
    if (s.action?.vds_code) {
      const meta = (s as any).meta;
      let text = `Generate datasheet for ${s.action.vds_code}`;
      if (meta?.valve_type) {
        text += ` (${meta.valve_type}`;
        if (meta.piping_class) text += `, ${meta.piping_class}`;
        text += `)`;
      }
      sendMessage(text);
    } else {
      sendMessage(s.title);
    }
  };

  // ── Session management ──
  const handleNewSession = () => {
    const newId = crypto.randomUUID().slice(0, 16);
    setSessionId(newId);  // triggers sessionStorage save via effect
    setBlocks([]);
    messagesRef.current = [];
    setTokenUsage({ input: 0, output: 0 });
  };

  const handleSelectSession = async (id: string) => {
    if (id === sessionId) return;

    if (isMobile) setSidebarOpen(false);

    const session = await getSession(id);

    setSessionId(id);
    setBlocks([]);
    messagesRef.current = [];
    setTokenUsage({ input: 0, output: 0 });

    if (session && session.messages && session.messages.length > 0) {
      const { blocks: restoredBlocks, messages: restoredMessages } = rebuildBlocksFromSession(session);
      setBlocks(restoredBlocks);
      messagesRef.current = restoredMessages;

      if (session.metadata?.total_input_tokens) {
        setTokenUsage({
          input: session.metadata.total_input_tokens || 0,
          output: session.metadata.total_output_tokens || 0,
        });
      }
    }
  };

  const handleSend = useCallback((text: string) => {
    if (isMobile) setSidebarOpen(false);
    sendMessage(text);
  }, [isMobile, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(inputText);
    }
  };

  const isEmpty = blocks.length === 0;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] overflow-hidden relative">
      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed overlay on mobile, static on desktop */}
      {sidebarOpen && (
        <div className={
          isMobile
            ? "fixed inset-y-0 left-0 w-72 z-50 shadow-xl"
            : "w-64 flex-shrink-0"
        }>
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-3 right-3 z-10 p-1 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <ConversationSidebar
            currentSessionId={sessionId}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
            refreshTrigger={sidebarRefresh}
          />
        </div>
      )}

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 border-b">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          >
            {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
          </button>
          <div className="p-1.5 sm:p-2 rounded-lg bg-gradient-to-br from-amber-500 to-purple-600">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg font-semibold truncate">Valve AI Agent</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Validate, generate, and explore valve datasheets with AI
            </p>
          </div>
        </div>

        {/* Messages area */}
        <ScrollArea className="flex-1 px-3 sm:px-6" ref={scrollRef}>
          <div className="max-w-3xl mx-auto py-4 sm:py-6">
            {isEmpty && (
              <div className="text-center py-8 sm:py-12">
                <div className="inline-flex p-3 sm:p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-purple-50 mb-4 sm:mb-6">
                  <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-amber-600" />
                </div>
                <h2 className="text-lg sm:text-xl font-semibold mb-2">Valve Datasheet Agent</h2>
                <p className="text-sm text-muted-foreground mb-6 sm:mb-8 max-w-md mx-auto px-2">
                  Tell me what valve you need — type, material, service, pressure class, size.
                  I'll find the right spec and generate the datasheet for you.
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
                block={block}
                onToggleThinking={() => {
                  if (block.kind === "thinking") {
                    setBlocks((prev) => {
                      const updated = [...prev];
                      updated[i] = { ...block, collapsed: !block.collapsed };
                      return updated;
                    });
                  }
                }}
                onSuggestionSelect={handleSuggestionSelect}
                onPreview={(code) => navigate("/generator", { state: { vdsNumber: code } })}
                onVdsClick={(code) => handleSend(`Generate datasheet for ${code}`)}
                onRetry={handleRetry}
                sessionId={sessionId}
              />
            ))}

            {isStreaming && blocks[blocks.length - 1]?.kind !== "status" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Thinking...</span>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="border-t bg-white px-3 sm:px-6 py-3 sm:py-4">
          <div className="max-w-3xl mx-auto relative">
            <div className="flex items-end gap-2 sm:gap-3">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isMobile ? "Ask about valves..." : "Ask about valves, specs, or paste a VDS code..."}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-300 px-3 sm:px-4 py-2.5 sm:py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                disabled={isStreaming}
              />
              {isStreaming ? (
                <button
                  onClick={handleStop}
                  className="p-2.5 sm:p-3 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors flex-shrink-0"
                >
                  <StopCircle className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={() => handleSend(inputText)}
                  disabled={!inputText.trim()}
                  className="p-2.5 sm:p-3 rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  <Send className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Block renderer ───────────────────────────────────────────────────────────

function BlockRenderer({
  block,
  onToggleThinking,
  onSuggestionSelect,
  onPreview,
  onVdsClick,
  onRetry,
  sessionId,
}: {
  block: MessageBlock;
  onToggleThinking: () => void;
  onSuggestionSelect: (s: SuggestionItem) => void;
  onPreview: (code: string) => void;
  onVdsClick: (code: string) => void;
  onRetry: () => void;
  sessionId?: string;
}) {
  switch (block.kind) {
    case "user":
      return (
        <div className="flex justify-end mb-4">
          <div className="bg-amber-600 text-white rounded-2xl rounded-br-md px-3 sm:px-4 py-2 sm:py-2.5 max-w-[85%] sm:max-w-[75%] text-sm whitespace-pre-wrap">
            {block.text}
          </div>
        </div>
      );

    case "text":
      return <AgentTextBlock text={block.text} onVdsClick={onVdsClick} />;

    case "thinking":
      return (
        <button
          onClick={onToggleThinking}
          className="flex items-center gap-1.5 mb-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {block.collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>Thinking...</span>
          {!block.collapsed && (
            <div className="ml-2 text-left text-gray-500 italic max-w-lg truncate">
              {block.text.slice(0, 200)}
            </div>
          )}
        </button>
      );

    case "tool_call": {
      const toolLabels: Record<string, string> = {
        find_valves: "Analyzing requirements & finding matching valves",
        generate_datasheet: "Generating valve datasheet",
        get_piping_class_info: "Retrieving piping class specs",
        validate_combination: "Validating valve combination",
        compare_valves: "Comparing valve specifications",
      };
      const toolDetail =
        block.name === "find_valves"
          ? [block.input?.valve_type, block.input?.material, block.input?.service, block.input?.piping_class]
              .filter(Boolean).join(", ")
          : block.name === "generate_datasheet" && block.input?.vds_code
            ? block.input.vds_code
            : block.name === "get_piping_class_info" && block.input?.piping_class
              ? block.input.piping_class
              : block.name === "validate_combination" && block.input?.valve_type
                ? `${block.input.valve_type} + ${block.input.seat} + ${block.input.spec}`
                : block.name === "compare_valves" && block.input?.vds_codes
                  ? block.input.vds_codes.join(" vs ")
                  : "";
      return (
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
          {block.done ? (
            <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-green-500" />
            </div>
          ) : (
            <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
          )}
          <Wrench className="w-3.5 h-3.5" />
          <span>{toolLabels[block.name] || "Processing your request"}</span>
          {toolDetail && <span className="text-gray-400">{toolDetail}</span>}
        </div>
      );
    }

    case "status":
      return (
        <div className="flex items-center gap-2 text-xs text-amber-500 py-1.5 mb-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{block.message}</span>
        </div>
      );

    case "suggestion":
      return <SuggestionCard suggestions={block.suggestions} onSelect={onSuggestionSelect} sessionId={sessionId} />;

    case "validation":
      return (
        <ValidationCard
          isValid={block.isValid}
          errors={block.errors}
          warnings={block.warnings}
          suggestions={block.suggestions}
          onSuggestionSelect={onSuggestionSelect}
        />
      );

    case "datasheet":
      return (
        <DatasheetCard
          vdsCode={block.vdsCode}
          data={block.data}
          completionPct={block.completionPct}
          sessionId={sessionId}
          validationErrors={block.validationErrors}
          validationWarnings={block.validationWarnings}
          projectName={block.projectName}
          docNumber={block.docNumber}
          revision={block.revision}
        />
      );

    case "error":
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 my-3 text-sm text-red-700 flex items-center justify-between">
          <span>{block.message}</span>
          {block.retryable && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 ml-4 px-3 py-1.5 text-xs font-medium bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}
        </div>
      );

    default:
      return null;
  }
}
