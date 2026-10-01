import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

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
      await fetchInvitePreview(
        data,
        async (input, init) => await env.SERVER.fetch(input, init)
      )
  );
