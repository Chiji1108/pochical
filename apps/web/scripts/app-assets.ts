// Makes what /try needs to open from the home screen as an app of its own:
// the icons, the manifest, and iOS's launch images in light and dark, all
// from the site icon (public/icon.png).
// Run again after changing the icon: bun run icon:app
import { writeFile } from "node:fs/promises";

import type { ImageAssets } from "@vite-pwa/assets-generator/api";
import { generateAssets } from "@vite-pwa/assets-generator/api/generate-assets";
import { generateManifestIconsEntry } from "@vite-pwa/assets-generator/api/generate-manifest-icons-entry";
import { instructions } from "@vite-pwa/assets-generator/api/instructions";
import { createAppleSplashScreens } from "@vite-pwa/assets-generator/config";
import type { Preset } from "@vite-pwa/assets-generator/config";
import sharp from "sharp";

import { iconColorOptions } from "../src/components/design-app-icon";
import { screenColor } from "../src/components/design-theme";
import { site } from "../src/lib/site";

const SOURCE = new URL("../public/icon.png", import.meta.url).pathname;
const FOLDER = new URL("../public/app/", import.meta.url).pathname;
const SPLASH_LINKS = new URL(
  "../src/lib/app-splash-screens.ts",
  import.meta.url
).pathname;
const BASE_PATH = "/app/";

// Maskable icons are cut to any shape inside the middle 80%, so the drawing
// shrinks into it on the icon's own ground.
const MASKABLE_PADDING = 0.2;
// On a launch image the icon takes 30% of the screen's shorter side.
const SPLASH_PADDING = 0.7;
// iOS rounds its app icons' corners by about this share of their width.
const CORNER_SHARE = 0.2237;

const moss = iconColorOptions.find((option) => option.id === "moss");
if (!moss) {
  throw new Error("The モス icon colors are missing");
}

const icon = await sharp(SOURCE).png().toBuffer();
const { width } = await sharp(icon).metadata();
const corner = Math.round(width * CORNER_SHARE);
const rounded = await sharp(icon)
  .ensureAlpha()
  .composite([
    {
      blend: "dest-in",
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}"><rect width="${width}" height="${width}" rx="${corner}"/></svg>`
      ),
    },
  ])
  .png()
  .toBuffer();

const imageAssets = (image: Buffer, preset: Preset): ImageAssets => ({
  basePath: BASE_PATH,
  htmlLinks: { includeId: false, xhtml: false },
  imageName: SOURCE,
  imageResolver: () => image,
  preset,
  resolveSvgName: (name) => name,
});

const none = { padding: 0, sizes: [] };

// The square icon as it is: iOS and Android round it themselves.
const icons = await instructions(
  imageAssets(icon, {
    apple: { padding: 0, sizes: [180] },
    maskable: {
      padding: MASKABLE_PADDING,
      resizeOptions: { background: moss.ground },
      sizes: [512],
    },
    transparent: { padding: 0, sizes: [192, 512] },
  })
);

// The icon with its corners rounded, on the screen's own color in light and
// dark, since iOS shows the image as it is.
const splash = await instructions(
  imageAssets(rounded, {
    apple: none,
    appleSplashScreens: createAppleSplashScreens({
      darkResizeOptions: { background: screenColor("moss", "dark", "deep") },
      linkMediaOptions: { basePath: BASE_PATH, log: false },
      padding: SPLASH_PADDING,
      resizeOptions: { background: screenColor("moss", "light", "deep") },
    }),
    maskable: none,
    transparent: none,
  })
);

await generateAssets(icons, true, FOLDER);
await generateAssets(splash, true, FOLDER);

const light = screenColor("moss", "light", "deep");
const manifest = {
  background_color: light,
  description: site.description,
  display: "standalone",
  id: "/try",
  lang: "ja",
  name: site.name,
  scope: "/try",
  short_name: site.name,
  start_url: "/try",
  theme_color: light,
  ...generateManifestIconsEntry("object", icons),
};
await writeFile(
  `${FOLDER}manifest.webmanifest`,
  `${JSON.stringify(manifest, null, 2)}\n`
);

const splashLinks = Object.values(splash.appleSplashScreen).map((image) => {
  if (!image.linkObject) {
    throw new Error(`No link for ${image.name}`);
  }
  const { href, media } = image.linkObject;
  return { href, media, rel: "apple-touch-startup-image" };
});
await writeFile(
  SPLASH_LINKS,
  `// Written by scripts/app-assets.ts (bun run icon:app); do not edit.
// iOS's launch images for /try, one per screen size, light and dark.
export const appSplashScreens = ${JSON.stringify(splashLinks, null, 2)};
`
);
