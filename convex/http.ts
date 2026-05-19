import { httpRouter } from "convex/server";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    status,
  });

http.route({
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const inviteCode = url.searchParams.get("inviteCode")?.trim();

    if (!inviteCode) {
      return json({ ok: false, reason: "missing_invite_code" }, 400);
    }

    const preview = await ctx.runQuery(api.invites.preview, { inviteCode });

    if (!preview) {
      return json({ ok: false, reason: "not_found" }, 404);
    }

    return json({ groupName: preview.groupName, ok: true });
  }),
  method: "GET",
  path: "/invite-preview",
});

export default http;
