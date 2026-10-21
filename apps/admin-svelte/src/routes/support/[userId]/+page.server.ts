import { textLimits } from "@pochical/design/limits";
import { fail } from "@sveltejs/kit";
import { env } from "cloudflare:workers";

import type { Actions, PageServerLoad } from "./$types";

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

// One user's chat a page at a time, as the app pages it: the latest, and
// earlier pages by ?before={seq}. Each load hands out a fresh op id, so an
// answer sent without JavaScript is still one line when sent twice.
export const load: PageServerLoad = async ({ params, url }) => {
  const before = Number(url.searchParams.get("before"));
  const page = await env.SERVER.supportChat(
    params.userId,
    Number.isInteger(before) && before > 0 ? before : 0
  );
  return { ...page, opId: crypto.randomUUID() };
};

export const actions: Actions = {
  answer: async ({ params, request }) => {
    const form = await request.formData();
    const field = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" ? value : "";
    };
    const text = field("text");
    const opId = field("opId");
    const count = [...graphemes.segment(text)].length;
    if (text.trim() === "") {
      return fail(400, { error: "返信を書いてください。", opId, text });
    }
    if (count > textLimits.chatMessage) {
      return fail(400, {
        error: `${textLimits.chatMessage}文字までです（${count}文字）。`,
        opId,
        text,
      });
    }
    const kept = await env.SERVER.answerSupport(
      params.userId,
      text,
      opId
    ).catch(() => false);
    if (!kept) {
      // The same op id comes back, so sending again is the same answer.
      return fail(502, { error: "返信できませんでした。", opId, text });
    }
    return { sent: true };
  },
};
