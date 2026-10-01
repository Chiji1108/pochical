// Swipes the demo's month pager as a person would, with a mouse and with a
// finger, and checks where each gesture lands: a short drag goes back, a
// drag past a quarter or a quick flick turns one page, a long drag turns
// only one, letting go over a day opens nothing, a tap still opens it, and
// scrolling up and down leaves the month, and the お休み summary under the
// calendar shows the month landed on. A trackpad's sideways swipe,
// coasting on well past a page, turns one month too.
// bun tools/layout-diff/pager-gestures.ts [url]

import { setTimeout as wait } from "node:timers/promises";

import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:3000/demo";
// Long enough for a swipe's spring to land.
const LAND_MS = 900;
const STEP_MS = 16;

declare global {
  // The frames `recordRestFrames` notes, in the page.
  // oxlint-disable-next-line no-var
  var restFrames: string[][] | undefined;
}

type Box = { x: number; y: number; width: number; height: number };

// The month the heading names, as a screen reader reads it: the rolling
// digits and letters beside it, the months either side, are hidden.
const heading = async (page: Page) =>
  await page
    .locator(".dc-phone h3")
    .first()
    .evaluate((title) => {
      const read = title.cloneNode(true);
      if (!(read instanceof Element)) {
        return "";
      }
      for (const hidden of read.querySelectorAll('[aria-hidden="true"]')) {
        hidden.remove();
      }
      return read.textContent ?? "";
    });

// The month the summary under the calendar shows, as it is seen: only
// the names it rolls in and out, while hidden, are left out.
const summaryShown = async (page: Page) =>
  await page
    .locator(".dc-phone button", { hasText: "のお休み" })
    .first()
    .evaluate((row) => {
      const shown: string[] = [];
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        let opacity = 1;
        let seen = false;
        for (
          let at = node.parentElement;
          at !== null && at !== row;
          at = at.parentElement
        ) {
          opacity *= Number(getComputedStyle(at).opacity);
          seen ||= at.getAttribute("aria-hidden") === "true";
        }
        if (seen && opacity > 0.5) {
          shown.push(node.textContent ?? "");
        }
      }
      return shown.join("").replace(/のお休み.*/u, "");
    });

// Notes, every frame the pages are at rest, the month the page in the
// middle shows and the months the heading and the summary show, as they
// are seen; `restFrames` reads them back. A frame between landing and the
// names catching up shows a month that is not the page's.
const recordRestFrames = async (page: Page) => {
  await page.evaluate(() => {
    // Sent into the page as source, so its helpers live inside it.
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const seenText = (root: Element) => {
      const shown: string[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        let opacity = 1;
        let seen = false;
        for (
          let at = node.parentElement;
          at !== null && at !== root;
          at = at.parentElement
        ) {
          opacity *= Number(getComputedStyle(at).opacity);
          seen ||= at.getAttribute("aria-hidden") === "true";
        }
        if (seen && opacity > 0.5) {
          shown.push(node.textContent ?? "");
        }
      }
      return shown.join("");
    };
    const frames: string[][] = [];
    globalThis.restFrames = frames;
    const note = () => {
      const middle = [
        ...document.querySelectorAll('.dc-phone [aria-hidden="false"]'),
      ].find((slide) => slide.querySelector('section[aria-label$="のシフト"]'));
      const viewport = middle?.parentElement?.parentElement?.parentElement;
      const title = document.querySelector(".dc-phone h3");
      const summary = [...document.querySelectorAll(".dc-phone button")].find(
        (button) => button.textContent?.includes("のお休み")
      );
      if (middle && viewport && title && summary) {
        const resting =
          Math.abs(
            middle.getBoundingClientRect().left -
              viewport.getBoundingClientRect().left
          ) < 1;
        if (resting) {
          const label =
            middle
              .querySelector('section[aria-label$="のシフト"]')
              ?.getAttribute("aria-label") ?? "";
          frames.push([
            label.replaceAll(/^\d+年|のシフト$/gu, ""),
            // After the year's four digits.
            seenText(title).slice(4),
            seenText(summary).replace(/のお休み.*/u, ""),
          ]);
        }
      }
      requestAnimationFrame(note);
    };
    requestAnimationFrame(note);
  });
};

const restFrames = async (page: Page) =>
  await page.evaluate(() => globalThis.restFrames ?? []);

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
  expect("short drag goes back", await heading(page), "2026年9月");
  expect("letting go opens no day", String(await daysOpened(page)), "0");
  await drag(page, [box.x + 40, y], box.width * 0.4, 12, 30);
  expect("drag past a quarter", await heading(page), "2026年8月");
  await flick(page, [right - 40, y], -60);
  expect("quick flick", await heading(page), "2026年9月");
  // From the right edge to the left one, the most a finger can: past a
  // page, and staying on the screen.
  await drag(page, [right - 5, y], 10 - right, 20, STEP_MS);
  expect("long drag turns one page", await heading(page), "2026年10月");
  // The summary rolls along with the drag, and stays on the month landed
  // on, page after page, as the heading does, from the first frame.
  await recordRestFrames(page);
  await drag(page, [right - 40, y], -box.width * 0.4, 12, 30);
  expect("summary follows a turn", await summaryShown(page), "11月");
  await drag(page, [box.x + 40, y], box.width * 0.4, 12, 30);
  expect("summary follows a turn back", await summaryShown(page), "10月");
  await drag(page, [box.x + 40, y], box.width * 0.4, 12, 30);
  expect("summary back on this month", await summaryShown(page), "今月");
  const frames = await restFrames(page);
  const astray = frames.filter(
    ([month, title, summary]) =>
      title !== month || (summary === "今月" ? "9月" : summary) !== month
  );
  expect(
    "names on the page's month every frame",
    astray.map((frame) => frame.join(" / ")).join(", "),
    ""
  );
  await drag(page, [right - 40, y], -box.width * 0.4, 12, 30);
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
  expect("finger swipe", await heading(page), "2026年10月");
  await swipe(box, box.width / 2, 200, 8, -150);
  expect("scrolling keeps the month", await heading(page), "2026年10月");
  expect("a swipe opens no day", String(await daysOpened(page)), "0");
  await context.close();
}

// A trackpad's two-finger swipe: wheel events a frame apart, strong at
// first and dying away as the trackpad coasts on, `dx` and `dy` pixels in
// all. No letting go comes, only a lull.
async function wheel(page: Page, dx: number, dy: number) {
  const frames = 40;
  const fade = 0.9;
  const share = (1 - fade) / (1 - fade ** frames);
  await moveAlong(frames, STEP_MS, async (step) => {
    const part = share * fade ** (step - 1);
    await page.mouse.wheel(dx * part, dy * part);
  });
  await page.waitForTimeout(LAND_MS);
}

async function withTrackpad(browser: Browser) {
  const { page, box, context } = await open(browser, false);
  await page.mouse.move(box.x + box.width / 2, box.y + 90);
  // Two pages' worth, which still turns only one.
  await wheel(page, box.width * 2, 0);
  expect("trackpad swipe turns one page", await heading(page), "2026年10月");
  await wheel(page, box.width / 10, 0);
  expect("short trackpad swipe goes back", await heading(page), "2026年10月");
  await wheel(page, -box.width * 2, 0);
  expect("trackpad swipe back", await heading(page), "2026年9月");
  await wheel(page, 30, 400);
  expect("trackpad scroll keeps the month", await heading(page), "2026年9月");
  expect("a trackpad swipe opens no day", String(await daysOpened(page)), "0");
  await context.close();
}

const browser = await chromium.launch({ channel: "chrome" });
await withMouse(browser);
await withFinger(browser);
await withTrackpad(browser);
await browser.close();
process.exitCode = failed > 0 ? 1 : 0;
