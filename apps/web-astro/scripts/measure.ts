// What each page loads, from the built site as served: JS requested
// before first contentful paint, by the load event, and after scrolling
// to the end (islands on client:visible), each gzipped at level 9 as
// apps/web/scripts/bundle-budget.ts counts; CSS and HTML raw and gzipped.
// node scripts/measure.ts <name>=<origin> ...
import { gzipSync } from "node:zlib";

import { chromium } from "playwright-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const KB = 1024;
const gz = (body: Buffer) => gzipSync(body, { level: 9 }).length;

const targets = process.argv.slice(2).map((arg) => arg.split("="));
const browser = await chromium.launch({ executablePath: CHROME });

type Loaded = { url: string; type: string; raw: number; gz: number; start: number; phase: string };

for (const [name, origin] of targets) {
  for (const path of ["/", "/privacy"]) {
    const context = await browser.newContext({ viewport: { height: 844, width: 390 } });
    const page = await context.newPage();
    const loaded: Loaded[] = [];
    let phase = "load";
    const pending: Promise<void>[] = [];
    page.on("response", (response) => {
      const type = response.request().resourceType();
      if (!["script", "stylesheet", "document"].includes(type)) return;
      const at = phase;
      pending.push(
        response.body().then(
          (body) => {
            loaded.push({
              gz: gz(body),
              phase: at,
              raw: body.length,
              start: response.request().timing().startTime,
              type,
              url: response.url(),
            });
          },
          () => {}
        )
      );
    });
    await page.goto(`${origin}${path}`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const { fcp, origin: timeOrigin } = await page.evaluate(() => ({
      fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0,
      origin: performance.timeOrigin,
    }));
    phase = "scroll";
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= height; y += 400) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(2000);
    await Promise.all(pending);
    const sum = (items: Loaded[], key: "gz" | "raw") =>
      (items.reduce((total, item) => total + item[key], 0) / KB).toFixed(1);
    const scripts = loaded.filter((item) => item.type === "script");
    const beforeFcp = scripts.filter((item) => item.start < timeOrigin + fcp);
    const byLoad = scripts.filter((item) => item.phase === "load");
    const css = loaded.filter((item) => item.type === "stylesheet");
    const html = loaded.filter((item) => item.type === "document");
    const inlineScripts = await page.evaluate(() =>
      [...document.querySelectorAll("script:not([src])")].reduce(
        (total, script) => total + (script.textContent?.length ?? 0),
        0
      )
    );
    console.log(
      JSON.stringify({
        app: name,
        cssGzKB: sum(css, "gz"),
        cssRawKB: sum(css, "raw"),
        fcpMs: Math.round(fcp),
        htmlGzKB: sum(html, "gz"),
        htmlRawKB: sum(html, "raw"),
        inlineScriptRawKB: (inlineScripts / KB).toFixed(1),
        jsBeforeFcpGzKB: sum(beforeFcp, "gz"),
        jsByLoadGzKB: sum(byLoad, "gz"),
        jsFiles: scripts.length,
        jsTotalGzKB: sum(scripts, "gz"),
        path,
      })
    );
    await context.close();
  }
}
await browser.close();
