import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { fetchInvitePreview } from "./invite-preview";
export const getInvite = createServerFn({ method: "GET" })
  .validator((code: string) => {
    if (typeof code !== "string" || code.length > 128) {
      throw new Error("Invalid invite code");
    }
    return code;
  })
  .handler(
    async ({ data }) =>
      await fetchInvitePreview(data, env.POCHICAL_CONVEX_HTTP_URL)
  );
