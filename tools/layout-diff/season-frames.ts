// Records the calendar's おたのしみ for each month as a strip of frames, to
// look at the seasons without a visible browser (a hidden pane throttles
// animation frames). Run with the dev server up:
//   bun tools/layout-diff/season-frames.ts [base url] [out dir]
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

// Each step has to wait for the one before it on the same page.
/* oxlint-disable no-await-in-loop */

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "tools/layout-diff/out/seasons";
const FRAMES_AT = [250, 700, 1300, 2000];
const MONTHS = 12;
const TURN_MS = 450;

mkdirSync(out, { recursive: true });
const browser = await chromium
  .launch({ channel: "chrome" })
  .catch(async () => await chromium.launch());
const page = await browser.newPage({
  deviceScaleFactor: 2,
  viewport: { height: 812, width: 375 },
});
await page.addInitScript(() => {
  localStorage.setItem(
    "pochical-design-device",
    JSON.stringify({ state: { device: { monthTap: "season" } }, version: 0 })
  );
});
await page.goto(`${base}/try`);
await page.waitForSelector("[data-month-title]");
await page.waitForTimeout(1000);
for (let index = 0; index < MONTHS; index += 1) {
  const name = await page.locator("[data-month-title]").first().textContent();
  await page.locator("[data-month-title]").first().click();
  let waited = 0;
  for (const at of FRAMES_AT) {
    await page.waitForTimeout(at - waited);
    waited = at;
    await page.screenshot({
      path: `${out}/${String(index).padStart(2, "0")}-${at}.png`,
    });
  }
  console.log(index, name);
  await page.waitForTimeout(1500);
  // The arrows are out of sight until focused, so click them in the page.
  await page
    .getByRole("button", { name: "次の月" })
    .evaluate((button: HTMLElement) => {
      button.click();
    });
  await page.waitForTimeout(TURN_MS);
}
await browser.close();
