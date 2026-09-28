// Loads the demo in fresh phone-sized tabs and checks the pager shows the
// month its heading names, as a stylesheet arriving late could bring it
// up on the month before, or a change of width after it loads (--resize),
// or going to another tab and back (--tabs), which hides the calendar.
// bun tools/layout-diff/pager-check.ts [url] [runs] [--resize] [--slow-css] [--tabs]

import { setTimeout as wait } from "node:timers/promises";

import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:3000/demo";
const runs = Number(process.argv[3] ?? "12");

const resize = process.argv.includes("--resize");
const slowCss = process.argv.includes("--slow-css");
const tabs = process.argv.includes("--tabs");

async function check(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext({
    deviceScaleFactor: 3,
    hasTouch: !resize,
    isMobile: !resize,
    viewport: { height: 812, width: resize ? 800 : 375 },
  });
  const page = await context.newPage();
  // The styles come in after the page's script, as on a slow network.
  if (slowCss) {
    await page.route(/panda\.css/u, async (route) => {
      await wait(1500);
      await route.continue();
    });
  }
  await page.goto(url);
  await page.locator(".dc-phone h3").first().waitFor();
  await page.waitForLoadState("load");
  await page.waitForTimeout(1000);
  if (tabs) {
    for (const tab of ["グループ", "カレンダー", "設定", "カレンダー"]) {
      // oxlint-disable-next-line no-await-in-loop
      await page.getByRole("button", { exact: true, name: tab }).last().click();
      // oxlint-disable-next-line no-await-in-loop
      await page.waitForTimeout(300);
    }
  }
  // Then the width changes, as when a phone turns or a window resizes.
  if (resize) {
    await page.setViewportSize({ height: 812, width: 390 });
    await page.waitForTimeout(800);
  }
  const result = await page.evaluate(() => {
    const heading = document.querySelector(".dc-phone h3")?.textContent ?? "";
    const phone = document.querySelector(".dc-phone")?.getBoundingClientRect();
    const shown = [
      ...document.querySelectorAll('section[aria-label$="のシフト"]'),
    ].find((section) => {
      const box = section.getBoundingClientRect();
      return (
        phone !== undefined &&
        box.left >= phone.left - 1 &&
        box.right <= phone.right + 1
      );
    });
    return { heading, shown: shown?.getAttribute("aria-label") ?? "none" };
  });
  await context.close();
  return result;
}

const browser = await chromium.launch({ channel: "chrome" });
let wrong = 0;
for (let run = 0; run < runs; run += 1) {
  // One load after another, each in a fresh tab with nothing cached.
  // oxlint-disable-next-line no-await-in-loop
  const { heading, shown } = await check(browser);
  const month = heading.replace(
    /^(?<year>\d{4})(?<month>\d+)月$/u,
    "$<year>年$<month>月"
  );
  const ok = shown.startsWith(month);
  if (!ok) {
    wrong += 1;
  }
  process.stdout.write(`${run}: ${heading} / ${shown}${ok ? "" : "  WRONG"}\n`);
}
await browser.close();
process.stdout.write(`wrong ${wrong} of ${runs}\n`);
