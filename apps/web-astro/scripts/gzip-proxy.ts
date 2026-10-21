// Cloudflare's edge compresses text it serves; the local previews do not.
// This sits in front of one so a measurement sees production's transfer
// sizes: bun scripts/gzip-proxy.ts <listen port> <upstream origin>
import { gzipSync } from "node:zlib";

const [port, upstream] = process.argv.slice(2);
const TEXT = /text\/|javascript|json|svg/;

Bun.serve({
  async fetch(request) {
    const url = new URL(request.url);
    const response = await fetch(`${upstream}${url.pathname}${url.search}`, {
      headers: { accept: request.headers.get("accept") ?? "*/*" },
      redirect: "manual",
    });
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    const type = headers.get("content-type") ?? "";
    const body = new Uint8Array(await response.arrayBuffer());
    if (!TEXT.test(type) || body.length === 0) {
      return new Response(body, { headers, status: response.status });
    }
    headers.set("content-encoding", "gzip");
    return new Response(gzipSync(body, { level: 6 }), {
      headers,
      status: response.status,
    });
  },
  port: Number(port),
});
console.log(`gzip proxy :${port} -> ${upstream}`);
