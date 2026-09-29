// Records the calendar's おたのしみ as strips of frames, to look at it
// without a visible browser (a hidden pane throttles animation frames).
// Run with the dev server up:
//   bun tools/layout-diff/surprise-frames.ts <light|dark> [taps] [out dir]
// Each tap picks its look at random; each strip is the /demo phone at the
// frames' times after one tap.
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

// Each step has to wait for the one before it on the same page.
/* oxlint-disable no-await-in-loop */

const appearance = process.argv[2] ?? "light";
const taps = Number(process.argv[3] ?? "8");
const out = process.argv[4] ?? "tools/layout-diff/out/surprise";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const FRAMES_AT = [400, 1200, 3000, 5200];
const ROUND_MS = 6500;
const SETTLE_MS = 1000;

mkdirSync(out, { recursive: true });
const browser = await chromium
  .launch({ channel: "chrome" })
  .catch(async () => await chromium.launch());
const page = await browser.newPage({
  deviceScaleFactor: 2,
  viewport: { height: 900, width: 1100 },
});
await page.addInitScript((scheme) => {
  localStorage.setItem(
    "pochical-design-device",
    JSON.stringify({
      state: { device: { appearance: scheme, monthTap: "surprise" } },
      version: 0,
    })
  );
}, appearance);
await page.goto(`${base}/demo`);
const phone = page.locator(".dc-phone").first();
const title = phone.locator("[data-month-title]").first();
await title.waitFor();
await page.waitForTimeout(SETTLE_MS);
for (let tap = 0; tap < taps; tap += 1) {
  await title.click();
  let waited = 0;
  for (const time of FRAMES_AT) {
    await page.waitForTimeout(time - waited);
    waited = time;
    await phone.screenshot({
      path: `${out}/${appearance}-${String(tap).padStart(2, "0")}-${time}.png`,
    });
  }
  await page.waitForTimeout(ROUND_MS - waited);
}
await browser.close();
