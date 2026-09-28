// Measures the /design demo's phone in the screens of states.ts and
// compares two runs, to show that a styling change, like moving rules from
// design.css to Panda, left the screens as they were. It compares what can
// be seen: every element with text, a label or a box of its own, by where
// it sits in the phone and how it is drawn. Wrappers that only lay things
// out are left out, so adding or removing one is no difference.
//
//   bun tools/layout-diff save before    (with the web dev server running)
//   ...change the styles...
//   bun tools/layout-diff check before   (measures again and compares)
//
// --url is the dev server (http://localhost:3000), --only keeps the states
// whose names contain it, --dark measures in dark mode, --width sets the
// window's width (800). Runs are kept in
// tools/layout-diff/out. It drives the installed Google Chrome, or without
// one Playwright's Chromium: bunx playwright-core install --only-shell chromium

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { chromium } from "playwright-core";
import type { Page } from "playwright-core";

import { measure } from "./measure";
import type { Screen } from "./measure";
import { states } from "./states";
import type { State } from "./states";

type Run = Record<string, Screen>;

const outDir = new URL("out/", import.meta.url);
// Wide enough for the design pages' phone column, tall enough for the
// phone; --width narrows it, as for the frame's small-screen rules.
const VIEWPORT = { height: 1300, width: 800 };
// How often the screen is measured until two measures in a row agree:
// the first load compiles the page, and springs and the pager take time
// to come to rest.
const SETTLE_MS = 300;
const SETTLE_TRIES = 20;

async function settled(page: Page, root: string) {
  // An image still loading has no size yet, and would be left out; lazy
  // ones would load only when scrolled to, so all load now.
  await page.evaluate(() => {
    for (const image of document.images) {
      image.loading = "eager";
    }
  });
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete)
  );
  let last = JSON.stringify(await page.evaluate(measure, root));
  for (let tries = 0; tries < SETTLE_TRIES; tries += 1) {
    // Each measure waits for the one before it.
    // oxlint-disable-next-line no-await-in-loop
    await page.waitForTimeout(SETTLE_MS);
    // oxlint-disable-next-line no-await-in-loop
    const screen = await page.evaluate(measure, root);
    const now = JSON.stringify(screen);
    if (now === last) {
      return screen;
    }
    last = now;
  }
  throw new Error("The screen did not come to rest");
}

async function measureState(page: Page, base: string, state: State) {
  await page.goto(new URL(state.path, base).href);
  const root = state.root ?? ".dc-phone";
  await page.locator(root).first().waitFor();
  await settled(page, root);
  if (state.steps !== undefined) {
    await state.steps(page);
  }
  return await settled(page, root);
}

// The installed Chrome when there is one, else Playwright's own Chromium.
async function launch() {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return await chromium.launch();
  }
}

async function measureAll(options: {
  url: string;
  only: string | undefined;
  dark: boolean;
  width: number;
}) {
  const browser = await launch();
  const context = await browser.newContext({
    colorScheme: options.dark ? "dark" : "light",
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    viewport: { ...VIEWPORT, width: options.width },
  });
  const page = await context.newPage();
  const { only } = options;
  const chosen =
    only === undefined
      ? states
      : states.filter((state) => state.name.includes(only));
  const run: Run = {};
  try {
    // A first load, not kept: a dev server just started compiles the page
    // then, and the pager can come up on the month before.
    const [first] = chosen;
    if (first !== undefined) {
      await measureState(page, options.url, first);
    }
    for (const state of chosen) {
      // One screen at a time, each from a fresh load of the page.
      // oxlint-disable-next-line no-await-in-loop
      run[state.name] = await measureState(page, options.url, state);
      process.stdout.write(`measured ${state.name}\n`);
    }
  } finally {
    await browser.close();
  }
  return run;
}

function compareScreen(earlier: Screen, screen: Screen) {
  const found: string[] = [];
  for (const key of new Set([
    ...Object.keys(earlier),
    ...Object.keys(screen),
  ])) {
    const was = earlier[key];
    const now = screen[key];
    if (was === undefined) {
      found.push(`  + ${key}`);
    } else if (now === undefined) {
      found.push(`  - ${key}`);
    } else {
      for (const property of Object.keys(was)) {
        if (was[property] !== now[property]) {
          found.push(
            `  ${key}  ${property}: ${was[property]} → ${now[property]}`
          );
        }
      }
    }
  }
  return found;
}

function compare(before: Run, after: Run) {
  let differences = false;
  const lines = Object.entries(after).map(([name, screen]) => {
    const earlier = before[name];
    if (earlier === undefined) {
      differences = true;
      return `${name}: not in the saved run`;
    }
    const found = compareScreen(earlier, screen);
    if (found.length === 0) {
      return `${name}: same`;
    }
    differences = true;
    return `${name}: ${found.length} differences\n${found.join("\n")}`;
  });
  return { differences, lines };
}

function isRun(value: unknown): value is Run {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      dark: { default: false, type: "boolean" },
      only: { type: "string" },
      url: { default: "http://localhost:3000", type: "string" },
      width: { default: String(VIEWPORT.width), type: "string" },
    },
  });
  const [command, label] = positionals;
  if (!(command === "save" || command === "check") || label === undefined) {
    throw new Error(
      "Usage: layout-diff save <name> | check <name> [--url] [--only] [--dark]"
    );
  }
  const width = Number(values.width);
  const suffix = `${values.dark ? "-dark" : ""}${width === VIEWPORT.width ? "" : `-${width}`}`;
  const file = new URL(`${label}${suffix}.json`, outDir);
  const run = await measureAll({
    dark: values.dark,
    only: values.only,
    url: values.url,
    width,
  });
  if (command === "save") {
    await mkdir(outDir, { recursive: true });
    await writeFile(file, `${JSON.stringify(run, null, 2)}\n`);
    process.stdout.write(
      `saved ${Object.keys(run).length} screens to ${file.pathname}\n`
    );
    return;
  }
  const before: unknown = JSON.parse(await readFile(file, "utf-8"));
  if (!isRun(before)) {
    throw new Error(`${file.pathname} is not a saved run`);
  }
  const { differences, lines } = compare(before, run);
  process.stdout.write(`${lines.join("\n")}\n`);
  process.exitCode = differences ? 1 : 0;
}

await main();
