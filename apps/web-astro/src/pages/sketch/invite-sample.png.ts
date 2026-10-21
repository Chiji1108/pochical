import { drawInviteImage } from "@pochical/web/src/lib/invite-image";
import type { APIRoute } from "astro";

// Sketch only: /design/share-image's sample group, drawn without apps/server,
// so the satori and resvg wasm path runs with no Service Binding behind it.
export const prerender = false;

export const SAMPLE_GROUP = {
  mark: { color: 0, emoji: "🍉", icon: "", letter: "", photoId: "" },
  memberCount: 5,
  name: "いとこ会",
};

export const GET: APIRoute = async () => {
  const png = await drawInviteImage(SAMPLE_GROUP);
  return new Response(Uint8Array.from(png), {
    headers: { "Content-Type": "image/png" },
  });
};
