import { presets } from "@pochical/design/themes";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { css, cx } from "styled-system/css";

import { DesignCalendar } from "../components/design-calendar";
import { sampleGroups } from "../components/design-group-data";
import { DesignProviders } from "../components/design-providers";
import { appSplashScreens } from "../lib/app-splash-screens";
import { initialDesignSchedule } from "../lib/design-days";
import { deviceSettingsKey } from "../lib/design-settings-key";
import {
  createUserStore,
  sampleCoworkers,
  UserStoreContext,
} from "../lib/design-user-store";
import { parseDesignVariants } from "../lib/design-variants";
import { screenColor } from "../lib/screen-color";
import { pageMeta } from "../lib/site";

const title = "ポチカル";

// The screen's color in each テーマ, light and dark, before the saved
// settings load.
const screenColors = Object.fromEntries(
  presets.map(({ id }) => [
    id,
    { dark: screenColor(id, "dark"), light: screenColor(id, "light") },
  ])
);

// Keeps the page hidden on the screen's color until React has drawn it
// with the saved settings; see useBarColor. After a few seconds it shows
// anyway, should React never get there.
const LAUNCH_STYLE_ID = "try-launch";
const LAUNCH_TIMEOUT = "3s";

// The server draws the screen in light, and iOS colors the status bar from
// the page it first draws. Before that first paint, this finds the screen's
// color from the saved 外観 and テーマ, or the device's light or dark, and
// gives it to the bar. On a page load, not a move within the site, it also
// hides the page on that color, so a dark screen does not flash light.
const launchScript = `(() => {
  const colors = ${JSON.stringify(screenColors)};
  let device = {};
  try {
    device = JSON.parse(localStorage.getItem(${JSON.stringify(deviceSettingsKey)}) ?? "{}").state?.device ?? {};
  } catch {}
  const scheme = device.appearance === "light" || device.appearance === "dark"
    ? device.appearance
    : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const color = (colors[device.preset] ?? colors.pochical)[scheme];
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = color;
  if (document.readyState !== "loading") return;
  const style = document.createElement("style");
  style.id = ${JSON.stringify(LAUNCH_STYLE_ID)};
  style.textContent = "html{background:" + color + "}body{visibility:hidden;animation:try-launch 0s ${LAUNCH_TIMEOUT} forwards}@keyframes try-launch{to{visibility:visible}}";
  document.head.append(style);
})();`;

export const Route = createFileRoute("/try")({
  component: TryPage,
  head: () => {
    const meta = pageMeta("試す", "スマホで触れるポチカルの試作", "/try", true);
    return {
      ...meta,
      links: [
        // Its name, icons and launch images on the home screen.
        { href: "/app/manifest.webmanifest", rel: "manifest" },
        ...appSplashScreens,
      ],
      meta: [
        // launchScript picks the color before the first paint, so the one
        // rendered here is only where it starts.
        {
          content: screenColors.pochical?.light,
          name: "theme-color",
          suppressHydrationWarning: true,
        },
        ...meta.meta,
        // Under the device's own bars, kept clear with its safe areas, and
        // no zooming in when a field smaller than 16px takes focus.
        {
          content:
            "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
          name: "viewport",
        },
        // Added to the home screen, it opens as an app of its own.
        { content: "yes", name: "mobile-web-app-capable" },
        { content: "yes", name: "apple-mobile-web-app-capable" },
        { content: title, name: "apple-mobile-web-app-title" },
        // The bar keeps its own strip in theme-color, with dark or light
        // text to match.
        { content: "default", name: "apple-mobile-web-app-status-bar-style" },
      ],
      scripts: [{ children: launchScript }],
    };
  },
});

// The current proposal for each open design choice.
const variants = parseDesignVariants({});

// The phone's screens fill the page, with nothing of the page to scroll
// or bounce behind them.
const page = css({ overscrollBehavior: "none" });

// Ends launchScript's wait, showing the page.
function showPage() {
  document.querySelector(`#${LAUNCH_STYLE_ID}`)?.remove();
}

// The browser's bars take the color of the screen under them, which
// follows the theme and its light or dark.
function useBarColor() {
  useEffect(() => {
    const phone = document.querySelector<HTMLElement>(".dc-phone");
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    if (!(phone && meta)) {
      showPage();
      return;
    }
    const root = document.documentElement;
    const before = { background: root.style.background, meta: meta.content };
    // A screen whose ground runs up under the bar, like the camera's,
    // lends it that ground instead.
    const follow = () => {
      const under = phone.querySelector<HTMLElement>(
        "[data-status-bar]:not([hidden])"
      );
      const color = getComputedStyle(under ?? phone).backgroundColor;
      meta.content = color;
      root.style.background = color;
    };
    // The screen first draws with the default settings and the saved ones
    // arrive in the render right after, so the first look waits a frame,
    // with the bar and the hidden page on launchScript's color until then.
    const frame = requestAnimationFrame(() => {
      follow();
      showPage();
    });
    const observer = new MutationObserver(follow);
    observer.observe(phone, {
      attributeFilter: ["style", "hidden"],
      childList: true,
      subtree: true,
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      meta.content = before.meta;
      root.style.background = before.background;
    };
  }, []);
}

// The app alone on a phone: the demo's sample person, starting over on
// reload. /demo has it framed, with the open design choices beside it.
function TryPage() {
  const [person] = useState(() =>
    createUserStore({
      coworkers: sampleCoworkers,
      groups: sampleGroups(),
      schedule: initialDesignSchedule(),
    })
  );
  useBarColor();
  return (
    <main className={cx("design-page", page)} id="main">
      <DesignProviders>
        <UserStoreContext value={person}>
          <DesignCalendar
            fullScreen
            initialEditing={false}
            variants={variants}
          />
        </UserStoreContext>
      </DesignProviders>
    </main>
  );
}
