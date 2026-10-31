// What every page of the site goes out with, the prerendered ones from the
// static assets (_headers, written at build time) and those drawn on
// request from the Worker (middleware.ts).
export const SECURITY_HEADERS = {
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

// The pages for one person only, which search leaves out: an invitation,
// a day's link and the account's.
export const PRIVATE_PATHS = ["/account/", "/day/", "/invite/"] as const;

// Workers' _headers file: every static file with the headers above, and the
// private pages kept out of search.
export const headersFile = (): string =>
  [
    "/*",
    ...Object.entries(SECURITY_HEADERS).map(
      ([name, value]) => `  ${name}: ${value}`
    ),
    ...PRIVATE_PATHS.flatMap((path) => [
      `${path}*`,
      "  X-Robots-Tag: noindex, nofollow",
    ]),
    "",
  ].join("\n");
