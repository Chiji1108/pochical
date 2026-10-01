// Holding back what an anonymous account makes cheap: making accounts and
// making groups. The limiters and their numbers are wrangler.jsonc's
// `ratelimits`; Cloudflare counts per location and stores nothing.

/** The client's address, as Cloudflare sets it on every request. */
const clientAddress = (request: Request): string | null =>
  request.headers.get("CF-Connecting-IP");

/**
 * Whether the request is past the limiter for its key. A request without a
 * client address, which only a local server or a test sends, is not
 * counted.
 */
export const overLimit = async (
  limiter: RateLimit,
  key: string | null
): Promise<boolean> => {
  if (key === null) {
    return false;
  }
  const { success } = await limiter.limit({ key });
  return !success;
};

/** Whether this anonymous sign-in is one too many from its address. */
export const tooManySignIns = async (
  limiter: RateLimit,
  request: Request
): Promise<boolean> => await overLimit(limiter, clientAddress(request));
