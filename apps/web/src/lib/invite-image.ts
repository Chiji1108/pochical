import iconData from "@pochical/prototype/assets/icon-192.png?inline";
import { InviteShareImage } from "@pochical/prototype/components/invite-share-image";
import type { InviteImageGroup } from "@pochical/prototype/components/invite-share-image";
import { SHARE_IMAGE } from "@pochical/prototype/lib/brand";
import { render } from "takumi-js";
import { googleFonts } from "takumi-js/helpers";
import type { FontSubset } from "takumi-js/helpers";

// Draws an invitation's share image (components/invite-share-image.tsx)
// as a PNG in the site's Worker with Takumi. Under the workerd condition
// it takes its WebAssembly as a module the bundler hands over, as Workers
// cannot compile WebAssembly from bytes.

// Noto Sans JP first, for Japanese shapes; then KR for Hangul, which JP
// has none of, and TC for the traditional characters JP lacks (嬤), so a
// group named in Korean or Chinese shows its name. Only the subsets the
// image's text falls in are fetched, once per isolate.
const FONTS = ["Noto Sans JP", "Noto Sans KR", "Noto Sans TC"].map((name) => ({
  name,
  weight: [400, 700],
}));

// Fonts and emoji keep for a day at Cloudflare's edge.
const fetchCached = async (input: string, init?: RequestInit) =>
  await fetch(input, {
    ...init,
    cf: { cacheEverything: true, cacheTtl: 86_400 },
  });

// The fonts' subsets, read once per isolate from their stylesheet, which
// Takumi's own cache does not keep (it keeps none over a megabyte, and the
// three CJK families' is more); a failed read is tried again next time.
let fontSubsets: Promise<FontSubset[]> | undefined;

const loadFonts = async (): Promise<FontSubset[]> => {
  fontSubsets ??= googleFonts({ families: FONTS, fetch: fetchCached });
  try {
    return await fontSubsets;
  } catch (error) {
    fontSubsets = undefined;
    throw error;
  }
};

// The name the image gives a photo mark, whose bytes come with it.
const PHOTO = "mark-photo";

/** The invitation's share image as a PNG, with a photo mark's bytes. */
export const drawInviteImage = async (
  group: Omit<InviteImageGroup, "photo">,
  photo: ArrayBuffer | undefined
): Promise<Uint8Array<ArrayBuffer>> =>
  await render(
    InviteShareImage({
      group: { ...group, photo: photo === undefined ? undefined : PHOTO },
      icon: iconData,
    }),
    {
      fonts: await loadFonts(),
      height: SHARE_IMAGE.height,
      images: {
        fetch: fetchCached,
        // Each group's own, so not kept once drawn.
        sources:
          photo === undefined
            ? []
            : [{ cache: "none", data: photo, src: PHOTO }],
        // An emoji whose picture fails to load is left out, not the image.
        throwOnError: false,
      },
      width: SHARE_IMAGE.width,
    }
  );
