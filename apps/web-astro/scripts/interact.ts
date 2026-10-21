// Drives / on each build: presses ポチッと。 (the sky should change), taps a
// day in the hero phone, scrolls to the end, and prints console errors
// (hydration mismatches among them).
// node scripts/interact.ts <origin> ...
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const skies = () =>
  [...document.querySelectorAll('[style*="gradient"]')].map((element) =>
    (element.getAttribute("style") ?? "").slice(0, 70)
  );
for (const origin of process.argv.slice(2)) {
  const page = await browser.newPage({ viewport: { height: 844, width: 390 } });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      errors.push(message.text().slice(0, 200));
    }
  });
  page.on("pageerror", (error) => errors.push(`pageerror ${error.message.slice(0, 200)}`));
  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const skyBefore = await page.evaluate(skies);
  await page.locator("h1 button").click();
  await page.waitForTimeout(2500);
  const skyAfter = await page.evaluate(skies);
  const dayBefore = await page.evaluate(() => document.body.innerText.match(/9月\d+日/)?.[0]);
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(300);
  const day = await page.evaluate(() => {
    for (const span of document.querySelectorAll("span")) {
      const box = span.getBoundingClientRect();
      if (span.textContent === "23" && box.left >= 0 && box.right <= innerWidth && box.top > 0 && box.bottom < innerHeight) {
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      }
    }
  });
  if (day) await page.mouse.click(day.x, day.y);
  await page.waitForTimeout(800);
  const dayAfter = await page.evaluate(() => document.body.innerText.match(/9月\d+日/)?.[0]);
  for (let y = 0; y < 6000; y += 400) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.locator("#closing-title button").click();
  await page.waitForTimeout(2000);
  const skyClosing = await page.evaluate(skies);
  console.log(
    JSON.stringify(
      {
        dayAfter,
        dayBefore,
        errors,
        origin,
        skyAfter: skyAfter.slice(0, 2),
        skyBefore: skyBefore.slice(0, 2),
        skyCountAfterClosingPress: skyClosing.length,
        skyCountBeforeClosingPress: skyAfter.length,
      },
      null,
      1
    )
  );
  await page.close();
}
await browser.close();
