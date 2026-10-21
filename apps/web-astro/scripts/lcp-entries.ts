// Every largest-contentful-paint entry / reports, with its element and
// size, and the scripts finished by then: why LCP lands where it does.
// node scripts/lcp-entries.ts <origin> ...
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
for (const origin of process.argv.slice(2)) {
  const context = await browser.newContext({ viewport: { height: 844, width: 390 } });
  await context.addInitScript(() => {
    (window as any).lcp = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        (window as any).lcp.push({
          el: `${entry.element?.tagName}.${String(entry.element?.className).slice(0, 30)} ${String(entry.element?.textContent).slice(0, 12)}`,
          size: entry.size,
          t: Math.round(entry.startTime),
        });
      }
    }).observe({ buffered: true, type: "largest-contentful-paint" });
  });
  const page = await context.newPage();
  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForTimeout(3000);
  const result = await page.evaluate(() => ({
    lcp: (window as any).lcp,
    scripts: performance
      .getEntriesByType("resource")
      .filter((entry: any) => entry.initiatorType === "script" || entry.name.endsWith(".js"))
      .map((entry) => `${entry.name.split("/").pop()?.slice(0, 20)}@${Math.round(entry.responseEnd)}`),
  }));
  console.log(origin, JSON.stringify(result, null, 1));
  await context.close();
}
await browser.close();
