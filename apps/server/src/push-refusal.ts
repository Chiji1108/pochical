// What APNs' and FCM's answers say of trying a push again
// (spec/sync-protocol.md, Push): both say to try 429 and the 5xx statuses
// again with backoff, after the service's Retry-After when it gives one.

import type { Outcome } from "./push";

/** How long a push service may take to answer before the try fails. */
export const PUSH_TIMEOUT_MS = 10_000;

/** A Retry-After header's wait: seconds, or an HTTP date. */
const retryAfterOf = (header: string | null): number | undefined => {
  if (header === null || header.trim() === "") {
    return undefined;
  }
  const seconds = Number(header);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(header) - Date.now();
  return Number.isNaN(ms) ? undefined : Math.max(0, ms);
};

/**
 * A refusal as APNs or FCM answered it: "later" for 429 and the 5xx
 * statuses, with the service's Retry-After when it gives one; `otherwise`
 * for the rest.
 */
export const refusal = (
  response: Response,
  reason: string,
  otherwise: "gone" | "failed"
): Outcome => {
  const { status } = response;
  if (status !== 429 && status < 500) {
    return { reason, sent: otherwise, status };
  }
  const retryAfterMs = retryAfterOf(response.headers.get("Retry-After"));
  return {
    reason,
    sent: "later",
    status,
    ...(retryAfterMs !== undefined && { retryAfterMs }),
  };
};
