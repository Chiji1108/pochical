import { env } from "cloudflare:workers";

import type { InviteFetch } from "./invite-preview";

// apps/server, reached Worker to Worker through the SERVER binding.
export const fromServer: InviteFetch = async (input, init) =>
  await env.SERVER.fetch(input, init);
