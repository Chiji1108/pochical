/**
 * Who of Pochical's people sent a request: the address Cloudflare Access
 * signed them in with, which it puts on every request it lets through to
 * the Worker. Locally, with no Access in front, it is "local".
 */
export const staffOf = (request: Request): string =>
  request.headers.get("Cf-Access-Authenticated-User-Email") ?? "local";
