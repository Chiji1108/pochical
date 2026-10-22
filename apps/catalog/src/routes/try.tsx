import { presets } from "@pochical/design/themes";
import { DesignApp } from "@pochical/prototype/components/design-app";
import {
  DesignProviders,
  useDesignTheme,
} from "@pochical/prototype/components/design-providers";
import { pageStyle } from "@pochical/prototype/components/design-theme";
import { useSamplePerson } from "@pochical/prototype/lib/design-sample-person";
import { deviceSettingsKey } from "@pochical/prototype/lib/design-settings-key";
import { UserStoreContext } from "@pochical/prototype/lib/design-user-store";
import { parseDesignVariants } from "@pochical/prototype/lib/design-variants";
import { css, cx } from "@pochical/styled-system/css";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useSyncExternalStore } from "react";

import { DesignPage, DesignToolbar } from "../components/design-page";
import { appSplashScreens } from "../lib/app-splash-screens";
import { pageMeta } from "../lib/page-meta";
import { screenColor } from "../lib/screen-color";

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
    const meta = pageMeta("試す", "スマホで触れるポチカルの試作");
    return {
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
// follows the theme and its light or dark. On a computer the page keeps
// its own ground around the framed phone.
function useBarColor(fullScreen: boolean) {
  useEffect(() => {
    if (!fullScreen) {
      showPage();
      return;
    }
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
  }, [fullScreen]);
}

// A computer: a mouse or trackpad to point with, and a window wider than
// the catalog's one column. A tablet, or a phone on its side, can be as
// wide, but a finger keeps the app filling its screen, as installed.
const COMPUTER = "(min-width: 761px) and (pointer: fine)";

function subscribeComputer(onChange: () => void) {
  const query = matchMedia(COMPUTER);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

// The server draws the phone's page; on a computer the render right after
// moves to the framed one, while launchScript still hides the page.
function useOnComputer() {
  return useSyncExternalStore(
    subscribeComputer,
    () => matchMedia(COMPUTER).matches,
    () => false
  );
}

// The framed phone at its size, and beside it the way onto a phone.
const onComputer = {
  layout: css({
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "48px",
    justifyContent: "center",
    padding: "32px 16px 48px",
  }),
  link: css({
    _hover: { borderColor: "var(--border-strong)" },
    alignItems: "center",
    bg: "background.card",
    border: "1px solid token(colors.separator)",
    borderRadius: "16px",
    color: "text.tertiary",
    display: "flex",
    fontSize: "12px",
    gap: "12px",
    lineHeight: "1.6",
    padding: "14px 16px",
    textDecoration: "none",
  }),
  linkText: css({
    "& strong": { color: "text.primary", fontSize: "14px" },
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "2px",
  }),
  note: css({
    "& h1": {
      fontSize: "22px",
      fontWeight: 500,
      letterSpacing: "0.04em",
      margin: 0,
    },
    "& p": { color: "text.tertiary", fontSize: "13px", lineHeight: "1.9" },
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    width: "280px",
  }),
  phone: css({ flex: "0 0 auto", width: "390px" }),
  qr: css({
    alignSelf: "flex-start",
    bg: "white",
    border: "1px solid token(colors.separator)",
    borderRadius: "16px",
    display: "flex",
    padding: "14px",
  }),
};

// What /try is for, a QR code that opens this page on a phone, and /demo
// for switching the samples.
function OpenOnPhone() {
  const url = `${location.origin}${location.pathname}`;
  return (
    <section className={onComputer.note}>
      <h1>スマホで試す</h1>
      <p>
        このページは、スマホで触るための試作です。カメラでQRコードを読み取ると、スマホで開きます。ホーム画面に追加すると、アプリのように開けます。
      </p>
      <div className={onComputer.qr}>
        <QRCodeSVG
          size={152}
          title="このページをスマホで開くQRコード"
          value={url}
        />
      </div>
      <Link className={onComputer.link} search={variants} to="/demo">
        <span className={onComputer.linkText}>
          <strong>デモで見る</strong>
          サンプルや比べる案を切り替えながら、ブラウザで触れます。
        </span>
        <ChevronRight aria-hidden="true" size={18} />
      </Link>
    </section>
  );
}

// The app alone on a phone: the demo's sample person, starting over on
// reload. On a computer it stands framed at a phone's size, with the way
// onto a phone beside it. /demo has it framed, with the open design
// choices beside it.
function TryPage() {
  const person = useSamplePerson();
  const theme = useDesignTheme();
  const computer = useOnComputer();
  useBarColor(!computer);
  const app = (
    <DesignProviders>
      <UserStoreContext value={person}>
        <DesignApp
          fullScreen={!computer}
          initialEditing={false}
          variants={variants}
        />
      </UserStoreContext>
    </DesignProviders>
  );
  if (computer) {
    return (
      <DesignPage style={pageStyle(theme)}>
        <DesignToolbar />
        <div className={onComputer.layout}>
          <div className={onComputer.phone}>{app}</div>
          <OpenOnPhone />
        </div>
      </DesignPage>
    );
  }
  return (
    <main className={cx("design-page", page)} id="main">
      {app}
    </main>
  );
}
