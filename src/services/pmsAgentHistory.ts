/**
 * pmsAgentHistory — API-backed persistence for PMS-Agent chat sessions.
 *
 * Storage: SQLite (`pms_agent_sessions.db` on the pms-generator-new
 * backend). Scoped per user via the X-User-Id header, sourced from the
 * frontend's AuthContext / authService.
 *
 * The PMS backend has no auth of its own, so the header is trusted. For
 * internal tool usage inside a signed-in SPA this is acceptable; for a
 * public deployment, move to verified JWT / session cookies.
 *
 * If the backend can't reach its store, the API returns 503 — callers
 * should show a "history disabled" banner rather than treating it as
 * an error.
 */

import { authService } from "./authService";

const PMS_API_BASE_URL =
  import.meta.env.VITE_PMS_API_URL || "http://localhost:8002/api";

// ── Types (unchanged from the localStorage version) ────────────────

export interface PMSAgentSession {
  id: string;
  title: string;
  created_at: string | null;
  updated_at: string | null;
  blocks: unknown[];
  message_count: number;
  last_message_preview: string;
}

export interface PMSAgentSessionSummary {
  id: string;
  title: string;
  created_at: string | null;
  updated_at: string | null;
  message_count: number;
  last_message_preview: string;
}

/** Thrown by history operations when the backend reports the store is
 *  unavailable (HTTP 503 — typically DATABASE_URL not set on the PMS
 *  backend). The sidebar catches this and renders a "history sync off"
 *  banner instead of the "No chats yet" empty state, which would be
 *  misleading since the user HAS chatted but the server isn't persisting. */
export class HistoryUnavailableError extends Error {
  constructor(message = "Chat history is currently unavailable") {
    super(message);
    this.name = "HistoryUnavailableError";
  }
}

/** Thrown when the backend doesn't know the history endpoints at all
 *  (HTTP 404 on the list route). Usually means the pms-generator service
 *  hasn't been redeployed with the chat-history changes yet. Separate
 *  from "session not found" (404 on GET/PATCH/DELETE of a specific id)
 *  which is a legitimate not-found. */
export class HistoryEndpointMissingError extends Error {
  constructor(message = "Chat history endpoints are not available on the server") {
    super(message);
    this.name = "HistoryEndpointMissingError";
  }
}

// ── Session-id + "current" pointer (still localStorage — cheap client state) ─
const CURRENT_KEY = "pms-agent-current-id";

export function newSessionId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getCurrentSessionId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

export function setCurrentSessionId(id: string | null) {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch {
    /* ignore */
  }
}

// ── API plumbing ───────────────────────────────────────────────────

function userIdHeader(): Record<string, string> {
  const u = authService.getCurrentUser();
  return u?.user_id ? { "X-User-Id": u.user_id } : {};
}

interface RequestOptions extends RequestInit {
  /** When true, treat HTTP 404 as "not found" (return null). Used by
   *  getSession where 404 is expected for missing ids. Defaults to false
   *  — any 404 on other paths throws HistoryEndpointMissingError. */
  allow404?: boolean;
}

async function request<T>(
  path: string,
  init: RequestOptions = {},
): Promise<T | null> {
  const { allow404 = false, ...fetchInit } = init;
  const response = await fetch(`${PMS_API_BASE_URL}${path}`, {
    ...fetchInit,
    headers: {
      "Content-Type": "application/json",
      ...userIdHeader(),
      ...(fetchInit.headers || {}),
    },
  });
  if (response.status === 503) {
    throw new HistoryUnavailableError();
  }
  if (response.status === 404) {
    if (allow404) return null;
    throw new HistoryEndpointMissingError();
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `HTTP ${response.status}`);
  }
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : null;
}

// ── Public API — all async now ─────────────────────────────────────

/** List the caller's saved sessions. Lets HistoryUnavailableError +
 *  HistoryEndpointMissingError propagate so the sidebar can show a
 *  specific banner for each case, rather than the misleading "No chats
 *  yet" empty state. */
export async function listSessions(): Promise<PMSAgentSessionSummary[]> {
  const rows = await request<PMSAgentSessionSummary[]>("/pms-agent/sessions");
  return rows ?? [];
}

/** Fetch a single session by id. Returns null when the session truly
 *  doesn't exist (HTTP 404 on this path is legitimate not-found). */
export async function getSession(id: string): Promise<PMSAgentSession | null> {
  return request<PMSAgentSession>(`/pms-agent/sessions/${id}`, {
    allow404: true,
  });
}

/** Create or overwrite a session. Automatically derives the title from the
 *  first user message (unless `titleOverride` is provided), the
 *  message_count, and a last-message preview. All errors propagate —
 *  callers (e.g. the auto-save effect on PMSAgentPage) use them to drive
 *  a status pill so the user sees "history sync off" rather than silent
 *  failure. */
export async function saveSession(
  id: string,
  blocks: unknown[],
  opts?: { titleOverride?: string },
): Promise<PMSAgentSession> {
  const body = {
    title: opts?.titleOverride ?? autoTitleFromBlocks(blocks),
    blocks,
    message_count: countUserTurns(blocks),
    last_message_preview: lastMessagePreview(blocks),
  };
  await request<{ ok: boolean }>(`/pms-agent/sessions/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return {
    id,
    title: body.title,
    created_at: null,
    updated_at: new Date().toISOString(),
    blocks,
    message_count: body.message_count,
    last_message_preview: body.last_message_preview,
  };
}

export async function renameSession(id: string, title: string): Promise<void> {
  await request(`/pms-agent/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function deleteSession(id: string): Promise<void> {
  await request(`/pms-agent/sessions/${id}`, { method: "DELETE" });
  if (getCurrentSessionId() === id) setCurrentSessionId(null);
}

export async function deleteAllSessions(): Promise<void> {
  const all = await listSessions();
  await Promise.all(all.map((s) => deleteSession(s.id)));
  setCurrentSessionId(null);
}

// ── Helpers (pure, client-side — used to precompute save payload) ─

function autoTitleFromBlocks(blocks: unknown[]): string {
  for (const b of blocks) {
    const rec = b as { kind?: string; text?: string };
    if (rec.kind === "user" && typeof rec.text === "string" && rec.text.trim()) {
      return rec.text.trim().slice(0, 60);
    }
  }
  return "New chat";
}

function countUserTurns(blocks: unknown[]): number {
  return blocks.filter((b) => (b as { kind?: string }).kind === "user").length;
}

function lastMessagePreview(blocks: unknown[]): string {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const rec = blocks[i] as {
      kind?: string;
      text?: string;
      response?: { reply?: string };
    };
    if (rec.kind === "assistant" && typeof rec.response?.reply === "string") {
      return rec.response.reply.trim().slice(0, 120);
    }
    if (rec.kind === "user" && typeof rec.text === "string") {
      return rec.text.trim().slice(0, 120);
    }
  }
  return "";
}
