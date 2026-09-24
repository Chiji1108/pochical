import handler from "@tanstack/react-start/server-entry";

export default {
  async fetch(request: Request) {
    const response = await handler.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Frame-Options", "DENY");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()"
    );
    headers.set("Cache-Control", "no-store");
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith("/invite/") || pathname.startsWith("/account/")) {
      headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
