// Swipes the demo's month pager as a person would, with a mouse and with a
// finger, and checks where each gesture lands: a short drag goes back, a
// drag past a quarter or a quick flick turns one page, a long drag turns
// only one, letting go over a day opens nothing, a tap still opens it, and
// scrolling up and down leaves the month.
// bun tools/layout-diff/pager-gestures.ts [url]

import { setTimeout as wait } from "node:timers/promises";

import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:3000/demo";
// Long enough for a swipe's spring to land.
const LAND_MS = 900;
const STEP_MS = 16;

type Box = { x: number; y: number; width: number; height: number };

const heading = async (page: Page) =>
  (await page.locator(".dc-phone h3").first().textContent()) ?? "";

const daysOpened = async (page: Page) =>
  await page.getByRole("button", { name: "完了" }).count();

async function open(browser: Browser, touch: boolean) {
  const context = await browser.newContext({
    hasTouch: touch,
    isMobile: touch,
    viewport: { height: 812, width: 375 },
  });
  const page = await context.newPage();
  await page.goto(url);
  // Hydrated, so the pager answers to the finger.
  await page.waitForFunction(() =>
    Object.keys(document.querySelector(".dc-phone") ?? {}).some((key) =>
      key.startsWith("__reactFiber")
    )
  );
  await page.waitForTimeout(600);
  const box = await page
    .locator('section[aria-label="2026年9月のシフト"]')
    .boundingBox();
  if (box === null) {
    throw new Error("No September on the page");
  }
  return { box, context, page };
}

// One move after another, at the pace of a finger.
async function moveAlong(
  steps: number,
  pause: number,
  move: (step: number) => Promise<unknown>
) {
  for (let step = 1; step <= steps; step += 1) {
    // oxlint-disable-next-line no-await-in-loop
    await move(step);
    // oxlint-disable-next-line no-await-in-loop
    await wait(pause);
  }
}

async function drag(
  page: Page,
  from: readonly [number, number],
  dx: number,
  steps: number,
  pause: number
) {
  const [x, y] = from;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await moveAlong(steps, pause, async (step) => {
    await page.mouse.move(x + (dx * step) / steps, y);
  });
  await page.mouse.up();
  await page.waitForTimeout(LAND_MS);
}

// A quick flick, a frame at a time: Playwright's own mouse moves take too
// long each to flick as fast as a finger does.
async function flick(page: Page, from: readonly [number, number], dx: number) {
  const [x, y] = from;
  await page.evaluate(
    async ({ dx: distance, x: startX, y: startY }) => {
      const frames = 3;
      const target = document.elementFromPoint(startX, startY);
      if (target === null) {
        return;
      }
      const send = (type: string, at: number) => {
        const event = new PointerEvent(type, {
          bubbles: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: at,
          clientY: startY,
          isPrimary: true,
          pointerId: 1,
          pointerType: "mouse",
        });
        target.dispatchEvent(event);
      };
      // Sent into the page as source, so its helpers live inside it.
      /* oxlint-disable unicorn/consistent-function-scoping, promise/avoid-new, require-await */
      const frame = async () =>
        await new Promise((resolve) => {
          requestAnimationFrame(resolve);
        });
      /* oxlint-enable unicorn/consistent-function-scoping, promise/avoid-new, require-await */
      send("pointerdown", startX);
      for (let step = 1; step <= frames; step += 1) {
        // oxlint-disable-next-line no-await-in-loop
        await frame();
        send("pointermove", startX + (distance * step) / frames);
      }
      send("pointerup", startX + distance);
    },
    { dx, x, y }
  );
  await page.waitForTimeout(LAND_MS);
}

let failed = 0;
function expect(name: string, got: string, want: string) {
  const ok = got === want;
  if (!ok) {
    failed += 1;
  }
  process.stdout.write(
    `${ok ? "ok  " : "FAIL"} ${name}: ${got}${ok ? "" : ` (want ${want})`}\n`
  );
}

async function withMouse(browser: Browser) {
  const { page, box, context } = await open(browser, false);
  const y = box.y + 90;
  const right = box.x + box.width;
  await drag(page, [right - 40, y], -box.width / 6, 10, 30);
  expect("short drag goes back", await heading(page), "20269月");
  expect("letting go opens no day", String(await daysOpened(page)), "0");
  await drag(page, [box.x + 40, y], box.width * 0.4, 12, 30);
  expect("drag past a quarter", await heading(page), "20268月");
  await flick(page, [right - 40, y], -60);
  expect("quick flick", await heading(page), "20269月");
  // From the right edge to the left one, the most a finger can: past a
  // page, and staying on the screen.
  await drag(page, [right - 5, y], 10 - right, 20, STEP_MS);
  expect("long drag turns one page", await heading(page), "202610月");
  await page
    .getByRole("button", { name: /^10月1日/u })
    .first()
    .click();
  await page.waitForTimeout(600);
  expect("a tap opens the day", String((await daysOpened(page)) > 0), "true");
  await context.close();
}

async function withFinger(browser: Browser) {
  const { page, box, context } = await open(browser, true);
  const cdp = await context.newCDPSession(page);
  const swipe = async (
    from: Box,
    fx: number,
    fy: number,
    dx: number,
    dy: number
  ) => {
    const at = (step: number) => ({
      x: from.x + fx + (dx * step) / 10,
      y: from.y + fy + (dy * step) / 10,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      touchPoints: [at(0)],
      type: "touchStart",
    });
    await moveAlong(
      10,
      STEP_MS,
      async (step) =>
        await cdp.send("Input.dispatchTouchEvent", {
          touchPoints: [at(step)],
          type: "touchMove",
        })
    );
    await cdp.send("Input.dispatchTouchEvent", {
      touchPoints: [],
      type: "touchEnd",
    });
    await page.waitForTimeout(LAND_MS);
  };
  await swipe(box, box.width - 30, 90, -box.width * 0.6, 0);
  expect("finger swipe", await heading(page), "202610月");
  await swipe(box, box.width / 2, 200, 8, -150);
  expect("scrolling keeps the month", await heading(page), "202610月");
  expect("a swipe opens no day", String(await daysOpened(page)), "0");
  await context.close();
}

const browser = await chromium.launch({ channel: "chrome" });
await withMouse(browser);
await withFinger(browser);
await browser.close();
process.exitCode = failed > 0 ? 1 : 0;
