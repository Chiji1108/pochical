// Full-page screenshots of / and /privacy from both builds at 390 and
// 1280 px, with reduced motion so the skies hold still, scrolled to the
// end first so every client:visible island has hydrated; then the share
// of pixels that differ between the two builds.
// node scripts/screenshots.ts <out dir> <origin a> <origin b>
import { chromium } from "playwright-core";
import sharp from "sharp";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [out, a, b] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });

async function shoot(origin: string, path: string, width: number, file: string) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    viewport: { height: 900, width },
  });
  const page = await context.newPage();
  await page.goto(`${origin}${path}`, { waitUntil: "load" });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 400) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2500);
  await page.screenshot({ animations: "disabled", fullPage: true, path: file });
  await context.close();
}

for (const path of ["/", "/privacy"]) {
  for (const width of [390, 1280]) {
    const slug = `${path === "/" ? "top" : path.slice(1)}-${width}`;
    const files = [`${out}/tanstack-${slug}.png`, `${out}/astro-${slug}.png`];
    await shoot(a, path, width, files[0]);
    await shoot(b, path, width, files[1]);
    const [left, right] = await Promise.all(
      files.map((file) => sharp(file).raw().ensureAlpha().toBuffer({ resolveWithObject: true }))
    );
    const h = Math.min(left.info.height, right.info.height);
    let differ = 0;
    for (let i = 0; i < width * h * 4; i += 4) {
      if (
        Math.abs(left.data[i] - right.data[i]) > 8 ||
        Math.abs(left.data[i + 1] - right.data[i + 1]) > 8 ||
        Math.abs(left.data[i + 2] - right.data[i + 2]) > 8
      ) {
        differ += 1;
      }
    }
    console.log(
      `${slug}: heights ${left.info.height} vs ${right.info.height}, ${((differ / (width * h)) * 100).toFixed(3)}% of pixels differ`
    );
  }
}
await browser.close();
