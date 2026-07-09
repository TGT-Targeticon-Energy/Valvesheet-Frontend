/**
 * Agent API Service — SSE client for the Valve Agent chat endpoint.
 */

const AGENT_API_URL =
  import.meta.env.VITE_AGENT_API_URL || "http://localhost:8001/api";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentEvent {
  type:
    | "thinking"
    | "text"
    | "tool_call"
    | "tool_result"
    | "suggestion"
    | "validation"
    | "datasheet"
    | "error"
    | "status"
    | "done";
  data: Record<string, any>;
}

export interface Suggestion {
  type: string;
  title: string;
  description: string;
  action: Record<string, any>;
  confidence?: number;
}

export interface ValidationData {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: Suggestion[];
}

export interface DatasheetData {
  vds_code: string;
  data: Record<string, string>;
  rule_based_fields?: string[];
  completion_pct: number;
}

// ── SSE Stream ───────────────────────────────────────────────────────────────

/**
 * Stream chat responses from the agent via SSE.
 *
 * @returns AbortController — call .abort() to cancel the stream.
 */
export function streamChat(
  messages: ChatMessage[],
  sessionId: string | undefined,
  onEvent: (event: AgentEvent) => void,
  onError: (error: string) => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const resp = await fetch(`${AGENT_API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          session_id: sessionId,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text();
        onError(`Agent API error ${resp.status}: ${text.slice(0, 200)}`);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        onError("No response body");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let currentData = "";
      let gotDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from the buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete last line

        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, ""); // strip \r from \r\n

          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData += (currentData ? "\n" : "") + line.slice(6);
          } else if (line === "" && currentEvent) {
            // End of SSE event block — dispatch
            try {
              const data = JSON.parse(currentData);
              if (currentEvent === "done") gotDone = true;
              onEvent({ type: currentEvent as AgentEvent["type"], data });
            } catch {
              // Skip malformed JSON
            }
            currentEvent = "";
            currentData = "";
          } else if (line === "") {
            // Empty line without event — reset
            currentEvent = "";
            currentData = "";
          }
        }
      }

      // Signal done only if backend didn't send an explicit done event
      if (!gotDone) {
        onEvent({ type: "done", data: {} });
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        onError(err.message || "Stream failed");
      }
    }
  })();

  return controller;
}

// ── REST Endpoints ───────────────────────────────────────────────────────────

export async function validateCombination(params: {
  valve_type: string;
  seat: string;
  spec: string;
  end_conn?: string;
  bore?: string;
}): Promise<ValidationData> {
  const resp = await fetch(`${AGENT_API_URL}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!resp.ok) throw new Error(`Validation failed: ${resp.status}`);
  return resp.json();
}

export async function getMetadata(): Promise<{
  valve_types: { code: string; name: string; standard: string }[];
  seat_types: { code: string; name: string; description: string }[];
  end_connections: { code: string; name: string; full_name: string }[];
  design_codes: { code: string; name: string; applicable_to: string[] }[];
  piping_specs: string[];
}> {
  const resp = await fetch(`${AGENT_API_URL}/metadata`);
  if (!resp.ok) throw new Error(`Metadata fetch failed: ${resp.status}`);
  return resp.json();
}

export async function getDatasheet(vdsCode: string): Promise<DatasheetData> {
  const resp = await fetch(`${AGENT_API_URL}/datasheets/${vdsCode}`);
  if (!resp.ok) throw new Error(`Datasheet fetch failed: ${resp.status}`);
  const d = await resp.json();
  return {
    vds_code: d.vds_code,
    data: d.datasheet,
    completion_pct: d.completion_pct,
  };
}

// ── Typeahead Suggestions ────────────────────────────────────────────────────

export interface TypeaheadResult {
  prompts: { text: string; category: string }[];
  valves: { vds_code: string; valve_type: string; piping_class: string }[];
  classes: { piping_class: string; pressure_class: string; material: string }[];
}

export async function getSuggestions(query: string): Promise<TypeaheadResult> {
  if (query.trim().length < 2) return { prompts: [], valves: [], classes: [] };
  const resp = await fetch(
    `${AGENT_API_URL}/suggest?q=${encodeURIComponent(query)}&limit=6`,
  );
  if (!resp.ok) return { prompts: [], valves: [], classes: [] };
  return resp.json();
}

// ── Session Management ──────────────────────────────────────────────────────

export interface SessionSummary {
  id: string;
  title: string;
  message_count: number;
  metadata: Record<string, any>;
  created_at: string | null;
  updated_at: string | null;
}

export interface SessionDetail extends SessionSummary {
  messages: ChatMessage[];
  agent_messages: Record<string, any>[];
}

export async function listSessions(limit = 50): Promise<SessionSummary[]> {
  const resp = await fetch(`${AGENT_API_URL}/sessions?limit=${limit}`);
  if (!resp.ok) return [];
  return resp.json();
}

export async function getSession(sessionId: string): Promise<SessionDetail | null> {
  const resp = await fetch(`${AGENT_API_URL}/sessions/${sessionId}`);
  if (!resp.ok) return null;
  return resp.json();
}

export async function renameSession(sessionId: string, title: string): Promise<boolean> {
  const resp = await fetch(`${AGENT_API_URL}/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return resp.ok;
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const resp = await fetch(`${AGENT_API_URL}/sessions/${sessionId}`, {
    method: "DELETE",
  });
  return resp.ok;
}

// ── Download Tracking ───────────────────────────────────────────────────────

export interface DownloadRecord {
  id: number;
  session_id: string | null;
  vds_codes: string[];
  filename: string;
  download_type: "xlsx" | "zip";
  sheet_count: number;
  created_at: string | null;
}

export async function saveDownload(params: {
  session_id?: string;
  vds_codes: string[];
  filename: string;
  download_type: "xlsx" | "zip";
  sheet_count: number;
}): Promise<DownloadRecord | null> {
  try {
    const resp = await fetch(`${AGENT_API_URL}/downloads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch {
    return null;
  }
}

export async function listDownloads(limit = 50): Promise<DownloadRecord[]> {
  try {
    const resp = await fetch(`${AGENT_API_URL}/downloads?limit=${limit}`);
    if (!resp.ok) return [];
    return resp.json();
  } catch {
    return [];
  }
}

// ── PMS sync (engineer-approved push from PMS Generator) ─────────────────────

export interface SyncFromGeneratorResult {
  ok: boolean;
  spec_code: string;
  valve_assignments: number;
  pipe_schedule: number;
  pt_ratings: number;
  flanges: number;
  vds_entries_evicted: number;
  synced_at: string;
}

/**
 * Push an engineer-approved PMS class from the PMS Generator into the
 * Valvesheet AI agent.
 *
 * Server pulls the latest snapshot for `specCode` out of pms_cache, writes
 * it to the agent's local store, invalidates the in-process caches, and
 * evicts old VDS index entries so the next chat query rebuilds the class
 * from current data.
 *
 * @throws Error with the server detail on non-2xx.
 */
export async function syncPmsFromGenerator(
  specCode: string,
): Promise<SyncFromGeneratorResult> {
  const resp = await fetch(
    `${AGENT_API_URL}/pms/sync-from-generator/${encodeURIComponent(specCode)}`,
    { method: "POST" },
  );
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const errBody = await resp.json();
      detail = errBody.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return resp.json();
}
