/**
 * PMSConversationSidebar — left-rail list of saved PMS-agent chats.
 *
 * Backed by localStorage (pmsAgentHistory). Shows newest conversations
 * first, supports rename / delete / new-chat. When a session row is
 * clicked, `onSelectSession(id)` fires and the parent loads that
 * conversation's blocks back into the chat view.
 */
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  MessageSquare,
  Trash2,
  Pencil,
  Check,
  X,
  Clock,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  deleteSession as apiDeleteSession,
  listSessions,
  renameSession,
  HistoryEndpointMissingError,
  HistoryUnavailableError,
  PMSAgentSessionSummary,
} from "@/services/pmsAgentHistory";

interface Props {
  currentSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteCurrent?: () => void;
  /** Bumped by the parent whenever blocks change, so we re-read localStorage */
  refreshTrigger?: number;
  /** Optional: close handler when embedded in a mobile drawer */
  onClose?: () => void;
}

export function PMSConversationSidebar({
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteCurrent,
  refreshTrigger,
  onClose,
}: Props) {
  const [sessions, setSessions] = useState<PMSAgentSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const rows = await listSessions();
        if (!cancelled) setSessions(rows);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof HistoryUnavailableError) {
          setErrorMsg(
            "History sync is off. The PMS server's DATABASE_URL isn't " +
              "configured — ask your ops person to set it on Render so your " +
              "chats can persist.",
          );
        } else if (err instanceof HistoryEndpointMissingError) {
          setErrorMsg(
            "The server doesn't expose chat-history endpoints yet. This " +
              "usually means the backend hasn't been redeployed with the " +
              "latest changes. Push + redeploy the pms-generator service.",
          );
        } else {
          setErrorMsg(
            err instanceof Error ? err.message : "Failed to load history",
          );
        }
        setSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [refreshTrigger]);

  const startEditing = (s: PMSAgentSessionSummary) => {
    setEditingId(s.id);
    setEditTitle(s.title);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const finishRename = async (id: string) => {
    const trimmed = editTitle.trim();
    if (trimmed) {
      try {
        await renameSession(id, trimmed);
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, title: trimmed } : s)),
        );
      } catch (err) {
        console.error("rename failed", err);
      }
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDeleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (id === currentSessionId && onDeleteCurrent) onDeleteCurrent();
    } catch (err) {
      console.error("delete failed", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 bg-white">
        <MessageSquare className="w-4 h-4 text-gray-600" />
        <div className="text-sm font-semibold text-gray-800 flex-1">History</div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 sm:hidden"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* New chat */}
      <div className="px-2 py-2 border-b border-gray-200 bg-white">
        <button
          onClick={onNewSession}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 text-sm text-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4 text-blue-600" />
          <span className="font-medium">New chat</span>
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-gray-500 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading history…
          </div>
        ) : errorMsg ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">History unavailable</div>
              <div className="mt-0.5 leading-snug">{errorMsg}</div>
            </div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-500">
            <MessageSquare className="w-6 h-6 mx-auto mb-2 text-gray-300" />
            No chats yet.
            <br />
            Your past conversations will appear here.
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((s) => {
              const isActive = s.id === currentSessionId;
              const isEditing = s.id === editingId;
              return (
                <div
                  key={s.id}
                  className={`group rounded-lg transition-colors ${
                    isActive
                      ? "bg-blue-100 border border-blue-300"
                      : "hover:bg-white border border-transparent hover:border-gray-200"
                  }`}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      <input
                        ref={inputRef}
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") finishRename(s.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="flex-1 min-w-0 text-sm px-2 py-1 rounded border border-gray-300 focus:outline-none focus:border-blue-400"
                      />
                      <button
                        onClick={() => finishRename(s.id)}
                        className="p-1 rounded hover:bg-green-100 text-green-600"
                        aria-label="Save"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 rounded hover:bg-red-100 text-red-600"
                        aria-label="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSelectSession(s.id)}
                      className="w-full text-left px-3 py-2"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-sm truncate ${
                              isActive
                                ? "font-semibold text-blue-900"
                                : "font-medium text-gray-800"
                            }`}
                            title={s.title}
                          >
                            {s.title}
                          </div>
                          {s.last_message_preview && (
                            <div className="text-xs text-gray-500 truncate mt-0.5">
                              {s.last_message_preview}
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                            <Clock className="w-2.5 h-2.5" />
                            {formatTime(s.updated_at)}
                            <span className="mx-1">·</span>
                            <span>
                              {s.message_count}{" "}
                              {s.message_count === 1 ? "turn" : "turns"}
                            </span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(s);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                startEditing(s);
                              }
                            }}
                            className="p-1 rounded hover:bg-gray-200 text-gray-500 cursor-pointer"
                            aria-label="Rename"
                          >
                            <Pencil className="w-3 h-3" />
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete "${s.title}"?`)) void handleDelete(s.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                if (confirm(`Delete "${s.title}"?`)) void handleDelete(s.id);
                              }
                            }}
                            className="p-1 rounded hover:bg-red-100 text-red-500 cursor-pointer"
                            aria-label="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
