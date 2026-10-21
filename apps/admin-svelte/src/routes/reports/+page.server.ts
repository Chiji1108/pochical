import { env } from "cloudflare:workers";

export const load = async () => ({ reports: await env.SERVER.reports() });
