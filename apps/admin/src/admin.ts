// What the pages ask of the server, through the service binding to its
// AdminEntrypoint (Workers RPC), run on the admin site's server.
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

export const getSupportChats = createServerFn().handler(
  async () => await env.SERVER.supportChats()
);

export const getSupportChat = createServerFn()
  .validator((userId: string) => userId)
  .handler(async ({ data }) => await env.SERVER.supportChat(data));

export const answerSupport = createServerFn({ method: "POST" })
  .validator((answer: { userId: string; text: string }) => answer)
  .handler(
    async ({ data }) => await env.SERVER.answerSupport(data.userId, data.text)
  );

export const getReports = createServerFn().handler(
  async () => await env.SERVER.reports()
);

/** When, as Pochical's people read it: Japan's time. */
export const when = (ms: number): string =>
  new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
