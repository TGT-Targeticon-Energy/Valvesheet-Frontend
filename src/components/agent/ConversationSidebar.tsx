/**
 * ConversationSidebar — Tabbed sidebar with Conversations + Downloads library.
 */

import { useState, useEffect, useRef } from "react";
import {
  Plus, MessageSquare, Trash2, Pencil, Check, X, Loader2,
  Download, MessagesSquare,
} from "lucide-react";
import {
  listSessions,
  renameSession,
  deleteSession as apiDeleteSession,
  SessionSummary,
} from "@/services/agentApi";
import { DownloadLibrary } from "./DownloadLibrary";

interface Props {
  currentSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  refreshTrigger?: number;
}

type Tab = "chats" | "downloads";

export function ConversationSidebar({
  currentSessionId,
  onSelectSession,
  onNewSession,
  refreshTrigger,
}: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("chats");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listSessions(50).then((data) => {
      if (!cancelled) {
        setSessions(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [refreshTrigger]);

  const handleRename = async (id: string) => {
    if (!editTitle.trim()) {
      setEditingId(null);
      return;
    }
    await renameSession(id, editTitle.trim());
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: editTitle.trim() } : s))
    );
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await apiDeleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === currentSessionId) {
      onNewSession();
    }
  };

  const startEditing = (s: SessionSummary) => {
    setEditingId(s.id);
    setEditTitle(s.title);
    setTimeout(() => inputRef.current?.focus(), 50);
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

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r">
      <div className="p-3 border-b">
        <button
          onClick={onNewSession}
          className="flex items-center gap-2 w-full px-3 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New conversation
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab("chats")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "chats"
              ? "text-blue-600 border-b-2 border-blue-600 bg-white"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          }`}
        >
          <MessagesSquare className="w-3.5 h-3.5" />
          Chats
        </button>
        <button
          onClick={() => setActiveTab("downloads")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "downloads"
              ? "text-blue-600 border-b-2 border-blue-600 bg-white"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          Downloads
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "downloads" ? (
          <DownloadLibrary refreshTrigger={refreshTrigger} />
        ) : loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-gray-400">
            No conversations yet
          </div>
        ) : (
          <div className="py-2">
            {sessions.map((s) => {
              const isActive = s.id === currentSessionId;
              const isEditing = editingId === s.id;

              return (
                <div
                  key={s.id}
                  className={`group flex items-center gap-2 mx-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? "bg-blue-100 text-blue-900"
                      : "hover:bg-gray-100 text-gray-700"
                  }`}
                  onClick={() => !isEditing && onSelectSession(s.id)}
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0 text-gray-400" />

                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-1">
                      <input
                        ref={inputRef}
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(s.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="flex-1 text-sm bg-white border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-blue-400"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRename(s.id); }}
                        className="p-0.5 text-green-600 hover:text-green-700"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                        className="p-0.5 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{s.title}</div>
                        <div className="text-[10px] text-gray-400">
                          {s.message_count} msgs {formatTime(s.updated_at)}
                        </div>
                      </div>
                      <div className="hidden group-hover:flex items-center gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); startEditing(s); }}
                          className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                          className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
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
