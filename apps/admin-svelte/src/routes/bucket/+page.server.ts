import { fail } from "@sveltejs/kit";
import { env } from "cloudflare:workers";

import type { Actions, PageServerLoad } from "./$types";

// The photos bucket held up against what names each object (棚卸し): run
// as the page loads, so again after 削除 and on 再実行. Only 削除 deletes.
export const load: PageServerLoad = async () => ({
  audit: await env.SERVER.bucketAudit(),
});

export const actions: Actions = {
  clean: async ({ request }) => {
    // As of the audit shown, so what passed the grace since stays.
    const form = await request.formData();
    const asOfMs = Number(form.get("asOfMs"));
    if (!Number.isInteger(asOfMs)) {
      return fail(400, { failed: true as const });
    }
    try {
      return { cleanup: await env.SERVER.cleanBucket(asOfMs) };
    } catch {
      return fail(502, { failed: true as const });
    }
  },
};
