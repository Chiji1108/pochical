import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm?module";
import satori, { init as initSatori } from "satori/standalone";
import yogaWasm from "satori/yoga.wasm?module";

import iconData from "../../public/app/pwa-192x192.png?inline";
import { InviteShareImage } from "../components/invite-share-image";
import type { InviteImageGroup } from "../components/invite-share-image";
import { SHARE_IMAGE } from "./site";

// Draws an invitation's share image (components/invite-share-image.tsx)
// as a PNG in the site's Worker: satori lays it out as SVG and resvg paints
// it. Workers cannot compile WebAssembly from bytes, so both engines come
// in as modules the bundler hands over. satori stays at 0.32: 0.33 shapes
// text with harfbuzzjs, whose loader looks for a script URL a Worker does
// not have.

const FONT = "Noto Sans JP";
// Only the characters drawn are fetched, so a font is a few kilobytes.
const FONT_CSS = "https://fonts.googleapis.com/css2";
const FONT_URL = /src: url\((?<url>[^)]+)\)/u;
// Twemoji, the emoji set satori's own examples use, pinned so a group's
// mark does not change under it.
const EMOJI_SVG =
  "https://cdn.jsdelivr.net/gh/jdecked/twemoji@16.0.1/assets/svg";
// The text the image always holds besides the group's name.
const FIXED_TEXT = "ポチカルグループへの招待・メンバー0123456789人 ";
// External assets keep for a day at Cloudflare's edge.
const ASSET_CACHE = { cf: { cacheEverything: true, cacheTtl: 86_400 } };

// resvg refuses a second start, which a module reloaded in development
// (or a retry after a failed draw) would make.
const startResvg = async (): Promise<void> => {
  try {
    await initWasm(resvgWasm);
  } catch (error) {
    if (!(error instanceof Error && error.message.includes("Already"))) {
      throw error;
    }
  }
};

const startEngines = async (): Promise<void> => {
  await Promise.all([initSatori(yogaWasm), startResvg()]);
};

// Started once per isolate, by the first image it draws.
let engines: Promise<void> | undefined;

const loadEngines = async (): Promise<void> => {
  engines ??= startEngines();
  try {
    await engines;
  } catch (error) {
    // The next image tries again.
    engines = undefined;
    throw error;
  }
};

const fontOf = async (weight: number, text: string): Promise<ArrayBuffer> => {
  const query = new URLSearchParams({
    family: `${FONT}:wght@${weight}`,
    text,
  });
  const answer = await fetch(`${FONT_CSS}?${query}`, ASSET_CACHE);
  const url = FONT_URL.exec(await answer.text())?.groups?.url;
  if (url === undefined) {
    throw new Error(`No ${FONT} ${weight} in Google Fonts' answer`);
  }
  const font = await fetch(url, ASSET_CACHE);
  return await font.arrayBuffer();
};

// An emoji's Twemoji file is named by its code points, without the
// variation selector.
const emojiOf = async (emoji: string): Promise<string> => {
  const name = [...emoji]
    .map((char) => char.codePointAt(0)?.toString(16) ?? "")
    .filter((point) => point !== "fe0f")
    .join("-");
  const response = await fetch(`${EMOJI_SVG}/${name}.svg`, ASSET_CACHE);
  if (!response.ok) {
    return "";
  }
  return `data:image/svg+xml;base64,${btoa(await response.text())}`;
};

/** The invitation's share image as a PNG. */
export const drawInviteImage = async (
  group: InviteImageGroup
): Promise<Uint8Array> => {
  await loadEngines();
  const text = `${FIXED_TEXT}${group.name}`;
  const [bold, regular] = await Promise.all([
    fontOf(700, text),
    fontOf(400, text),
  ]);
  const svg = await satori(InviteShareImage({ group, icon: iconData }), {
    fonts: [
      { data: bold, name: FONT, weight: 700 },
      { data: regular, name: FONT, weight: 400 },
    ],
    height: SHARE_IMAGE.height,
    loadAdditionalAsset: async (code, segment) =>
      code === "emoji" ? await emojiOf(segment) : [],
    width: SHARE_IMAGE.width,
  });
  return new Resvg(svg).render().asPng();
};
