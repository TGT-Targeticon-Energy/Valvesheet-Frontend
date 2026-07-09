/**
 * Auth event bus — bridge between low-level fetch wrappers (which can't
 * use React hooks) and the AuthProvider (which owns navigation + state).
 *
 * Fetch wrappers call `notifyUnauthorized()` when the backend returns
 * 401 / 403; the AuthProvider listens, runs `logout()`, and silently
 * pushes the user to /login.
 *
 * After a notifyUnauthorized fires we also enter a short "suppress
 * toasts" window. Every page's catch block does
 *     catch (e) { toast.error(e.message) }
 * which would otherwise flash a noisy "HTTP 401 Unauthorized" toast
 * before the redirect completes. `isAuthRedirectInProgress()` lets a
 * patched toast wrapper drop those messages.
 */
const EVENT_NAME = "auth:unauthorized";

let _lastFiredAt = 0;
const COOLDOWN_MS = 1500;

// Active suppression window — anything thrown while we're redirecting
// shouldn't pop a toast.
let _suppressUntil = 0;
const SUPPRESS_MS = 4000;

export function notifyUnauthorized(reason?: string): void {
  const now = Date.now();
  // Open the suppression window every time a 401 fires — even if the
  // event itself is coalesced, we still want to silence late-arriving
  // toasts from concurrent fetches.
  _suppressUntil = now + SUPPRESS_MS;
  if (now - _lastFiredAt < COOLDOWN_MS) return;
  _lastFiredAt = now;
  try {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { reason: reason || "Session expired" } }),
    );
  } catch {
    // Non-browser env (SSR, tests) — no-op
  }
}

/** True while we're mid-redirect — pages should skip toasts. */
export function isAuthRedirectInProgress(): boolean {
  return Date.now() < _suppressUntil;
}

export function onUnauthorized(
  handler: (reason: string) => void,
): () => void {
  const wrapped = (e: Event) => {
    const detail = (e as CustomEvent).detail || {};
    handler(detail.reason || "Session expired");
  };
  window.addEventListener(EVENT_NAME, wrapped as EventListener);
  return () => window.removeEventListener(EVENT_NAME, wrapped as EventListener);
}
