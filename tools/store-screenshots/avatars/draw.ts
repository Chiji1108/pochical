// Draws the coworkers' profile photos for the stores' screenshots (#806)
// from the drawings beside it, each a JPEG seed.ts uploads as the usual
// photo of one of them. Any square JPEG put in a drawing's place is
// uploaded instead; run again after changing a drawing:
//
//   pnpm exec tsx tools/store-screenshots/avatars/draw.ts
import { readdirSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

const folder = import.meta.dirname;
for (const file of readdirSync(folder)) {
  if (file.endsWith(".svg")) {
    // oxlint-disable-next-line no-await-in-loop -- three small pictures
    await sharp(path.join(folder, file))
      .jpeg({ quality: 90 })
      .toFile(path.join(folder, file.replace(/\.svg$/u, ".jpg")));
  }
}
