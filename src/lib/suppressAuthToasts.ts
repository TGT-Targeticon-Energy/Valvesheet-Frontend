/**
 * Global toast suppressor for auth-related errors.
 *
 * Wraps sonner's `toast.error` (and the generic `toast()` callable) so
 * any message that matches a 401/403 pattern, or that fires while a
 * silent auth redirect is in progress, gets dropped on the floor.
 *
 * Imported for side-effect from `main.tsx` (or App.tsx). No exports.
 */
import { toast } from "sonner";
import { isAuthRedirectInProgress } from "@/lib/authBus";

// Patterns that almost certainly come from a 401/403 fetch error and
// shouldn't be shown to the user. The auth bus handles the redirect.
const AUTH_ERROR_RE = /(HTTP\s+40[13]\b|\bUnauthorized\b|\bForbidden\b|Not authorized|Session expired|access denied)/i;

function isAuthMessage(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (isAuthRedirectInProgress()) return true;
  return AUTH_ERROR_RE.test(value);
}

// sonner's `toast` is both a function (toast("msg")) and has methods
// (toast.error("msg"), toast.success, toast.warning, …). Wrap each
// surface that produces visible UI from a string-or-error first arg.
const surfaces: Array<keyof typeof toast | "__call__"> = [
  "error", "warning", "info", "message", "success", "loading",
];

for (const key of surfaces) {
  const fn = (toast as any)[key];
  if (typeof fn !== "function") continue;
  (toast as any)[key] = function patched(this: unknown, msg: unknown, ...rest: unknown[]) {
    // Accept Error objects too — sonner stringifies them with .message
    const text = msg instanceof Error ? msg.message : msg;
    if (isAuthMessage(text)) return undefined as any;
    return fn.call(this, msg, ...rest);
  };
}

// Patch the callable form `toast("msg")` too.
const originalCall = toast as unknown as (msg: unknown, opts?: unknown) => unknown;
const patchedCall: any = function patched(this: unknown, msg: unknown, opts?: unknown) {
  const text = msg instanceof Error ? msg.message : msg;
  if (isAuthMessage(text)) return undefined;
  return originalCall.call(this, msg, opts);
};
// Copy the method properties back onto the patched callable so existing
// imports like `import { toast } from "sonner"` keep `.error / .success`.
for (const key of Object.keys(toast)) {
  patchedCall[key] = (toast as any)[key];
}
// Replace by mutating the module exports proxy is impossible — but
// every import gets the same `toast` reference. Since we've mutated
// `toast.error` / `toast.success` etc. directly on the original object,
// all existing imports automatically pick up the patched methods.
// We only NEEDED to patch the methods (toast.error is the common one).
// The callable wrapper above is informational; sonner consumers in this
// codebase use `toast.error(msg)` / `toast.success(msg)` style.
