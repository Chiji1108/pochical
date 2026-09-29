// Records the calendar's おたのしみ as strips of frames, to look at the
// seasons without a visible browser (a hidden pane throttles animation
// frames). Run with the dev server up:
//   bun tools/layout-diff/season-frames.ts <air|cells> [months ahead, e.g. 3,7] [out dir]
// Months are counted from the design's today (2026年9月); each strip is
// the /demo phone at the frames' times after the tap.
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

// Each step has to wait for the one before it on the same page.
/* oxlint-disable no-await-in-loop */

const look = process.argv[2] ?? "air";
const ahead = (process.argv[3] ?? "3,7").split(",").map(Number);
const out = process.argv[4] ?? "tools/layout-diff/out/seasons";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const FRAMES_AT =
  look === "air" ? [500, 1500, 3000, 5000] : [200, 500, 900, 1500];
const TURN_MS = 450;
const SETTLE_MS = 1000;

mkdirSync(out, { recursive: true });
const browser = await chromium
  .launch({ channel: "chrome" })
  .catch(async () => await chromium.launch());
const page = await browser.newPage({
  deviceScaleFactor: 2,
  viewport: { height: 900, width: 1100 },
});
await page.addInitScript(() => {
  localStorage.setItem(
    "pochical-design-device",
    JSON.stringify({ state: { device: { monthTap: "season" } }, version: 0 })
  );
});
await page.goto(`${base}/demo?seasonLook=${look}`);
const phone = page.locator(".dc-phone").first();
const title = phone.locator("[data-month-title]").first();
await title.waitFor();
await page.waitForTimeout(SETTLE_MS);
let at = 0;
for (const months of ahead) {
  // The arrows are out of sight until focused, so click them in the page.
  const next = phone.getByRole("button", { name: "次の月" });
  for (; at < months; at += 1) {
    await next.evaluate((button: HTMLElement) => {
      button.click();
    });
    await page.waitForTimeout(TURN_MS);
  }
  await page.waitForTimeout(SETTLE_MS);
  await title.click();
  let waited = 0;
  for (const time of FRAMES_AT) {
    await page.waitForTimeout(time - waited);
    waited = time;
    await phone.screenshot({ path: `${out}/${look}-${months}-${time}.png` });
  }
  console.log(look, months, await title.textContent());
  await page.waitForTimeout(8000 - waited);
}
await browser.close();
