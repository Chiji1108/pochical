import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

import { allowed } from "./access";

// Every request is checked before a page or a server function runs.
export default {
  async fetch(request: Request): Promise<Response> {
    const local = import.meta.env.DEV;
    if (
      !(await allowed(request, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD, local))
    ) {
      return new Response("Forbidden", { status: 403 });
    }
    return await handler.fetch(request);
  },
};
