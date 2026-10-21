// Sums the JavaScript each page loads, raw and gzipped here (level 9), in a
// fresh browser context per page, against a production build's preview:
//
//   ADMIN=http://localhost:3198 USER_ID=... bun apps/admin-rwsdk/scripts/measure-js.ts
//
// A throwaway helper of the admin sketches, not held to the repo's lint.
/* oxlint-disable eslint/no-await-in-loop, unicorn/no-await-expression-member */
import { gzipSync } from "bun";
import { chromium } from "playwright-core";

const admin = process.env.ADMIN ?? "http://localhost:3198";
const userId = process.env.USER_ID ?? "";
const pages = ["/", `/support/${userId}`, "/reports", "/bucket"];

const browser = await chromium.launch({ channel: "chrome" });
for (const path of pages) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const bodies: Promise<Buffer>[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") {
      bodies.push(response.body());
    }
  });
  await page.goto(`${admin}${path}`, { waitUntil: "networkidle" });
  const scripts = await Promise.all(bodies);
  const raw = scripts.reduce((sum, body) => sum + body.length, 0);
  const gzip = scripts.reduce(
    (sum, body) => sum + gzipSync(body, { level: 9 }).length,
    0
  );
  const html = (await (await fetch(`${admin}${path}`)).text()).length;
  console.log(
    `${path.startsWith("/support/") ? "/support/:userId" : path}\tfiles ${scripts.length}\traw ${(raw / 1024).toFixed(1)} KiB\tgzip ${(gzip / 1024).toFixed(1)} KiB\thtml ${(html / 1024).toFixed(1)} KiB`
  );
  await context.close();
}
await browser.close();
