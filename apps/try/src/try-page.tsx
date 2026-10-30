import { DesignApp } from "@pochical/prototype/components/design-app";
import { DesignPage } from "@pochical/prototype/components/design-page";
import {
  DesignProviders,
  useDesignTheme,
} from "@pochical/prototype/components/design-providers";
import {
  PhoneContext,
  SystemAlert,
} from "@pochical/prototype/components/design-sheet";
import {
  pageStyle,
  useThemeStyle,
} from "@pochical/prototype/components/design-theme";
import { useSamplePerson } from "@pochical/prototype/lib/design-sample-person";
import { UserStoreContext } from "@pochical/prototype/lib/design-user-store";
import { parseDesignVariants } from "@pochical/prototype/lib/design-variants";
import { css, cx } from "@pochical/styled-system/css";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { firstLaunchNotedKey } from "./lib/first-launch-note";

// The current proposal for each open design choice.
const variants = parseDesignVariants({});

// What this is, for anyone the link reaches: said beside the framed phone
// on a computer, and once over the app on a phone.
const prototypeNote =
  "入力した内容はこの端末の外に出ません。シフトやグループは、開き直すとサンプルに戻ります。";

// The phone's screens fill the page, with nothing of the page to scroll
// or bounce behind them.
const page = css({ overscrollBehavior: "none" });

// The browser's bars take the color of the screen under them, which
// follows the theme and its light or dark. On a computer they take the
// page's own ground around the framed phone.
function useBarColor(fullScreen: boolean) {
  useEffect(() => {
    const ground = document.querySelector<HTMLElement>("#main");
    const phone = document.querySelector<HTMLElement>(".dc-phone");
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    if (!(ground && phone && meta)) {
      return;
    }
    const root = document.documentElement;
    const before = { background: root.style.background, meta: meta.content };
    // A screen whose ground runs up under the bar, like the camera's,
    // lends it that ground instead.
    const follow = () => {
      const under = fullScreen
        ? (phone.querySelector<HTMLElement>(
            "[data-status-bar]:not([hidden])"
          ) ?? phone)
        : ground;
      const color = getComputedStyle(under).backgroundColor;
      meta.content = color;
      root.style.background = color;
    };
    follow();
    const observer = new MutationObserver(follow);
    observer.observe(phone, {
      attributeFilter: ["style", "hidden"],
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      meta.content = before.meta;
      root.style.background = before.background;
    };
  }, [fullScreen]);
}

// A computer's browser tab: a mouse or trackpad to point with, and a
// window wider than the pages' one column. A tablet, or a phone on its
// side, can be as wide, but a finger keeps the app filling its screen, as
// does opening it from the home screen or as an installed app.
const COMPUTER =
  "(min-width: 761px) and (pointer: fine) and (display-mode: browser)";

let computerQuery: MediaQueryList | undefined;
function computerList() {
  computerQuery ??= matchMedia(COMPUTER);
  return computerQuery;
}

function subscribeComputer(onChange: () => void) {
  computerList().addEventListener("change", onChange);
  return () => {
    computerList().removeEventListener("change", onChange);
  };
}

// Moving between the phone's page and the framed one builds the app
// again, as a window resized across the line does.
function useOnComputer() {
  return useSyncExternalStore(subscribeComputer, () => computerList().matches);
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

// What this app is for, and a QR code that opens this page on a phone.
function OpenOnPhone() {
  const url = `${location.origin}${location.pathname}`;
  return (
    <section className={onComputer.note}>
      <h1>スマホで試す</h1>
      <p>
        このページは、スマホで触るための試作です。カメラでQRコードを読み取ると、スマホで開きます。ホーム画面に追加すると、アプリのように開けます。
      </p>
      <p>{prototypeNote}</p>
      <div className={onComputer.qr}>
        <QRCodeSVG
          size={152}
          title="このページをスマホで開くQRコード"
          value={url}
        />
      </div>
    </section>
  );
}

// Whether this browser has been told what this is. Storage a browser
// refuses, as some private windows do, tells it again on each opening.
const NOTED = firstLaunchNotedKey;

function wasNoted() {
  try {
    return localStorage.getItem(NOTED) !== null;
  } catch {
    return false;
  }
}

function markNoted() {
  try {
    localStorage.setItem(NOTED, "1");
  } catch {
    // Said again on the next opening.
  }
}

// Over the whole screen, as the phone's own alerts are over the phone.
const alertLayer = css({ inset: 0, position: "fixed", zIndex: 100 });

// On a phone the app fills the screen, so what this is comes the way an
// app says something on its first launch: an alert over it, once, in the
// app's テーマ and light or dark.
function FirstLaunchNote() {
  const [noted, setNoted] = useState(wasNoted);
  const layer = useRef<HTMLDivElement>(null);
  const style = useThemeStyle();
  if (noted) {
    return null;
  }
  return (
    <div className={alertLayer} ref={layer} style={style}>
      <PhoneContext value={layer}>
        <SystemAlert
          buttons={[{ label: "はじめる" }]}
          message={prototypeNote}
          onClose={() => {
            markNoted();
            setNoted(true);
          }}
          title="ポチカルの試作です"
        />
      </PhoneContext>
    </div>
  );
}

// The app alone on a phone: the demo's sample person, starting over on
// reload. On a computer it stands framed at a phone's size, with the way
// onto a phone beside it. /demo has it framed, with the open design
// choices beside it.
export function TryPage() {
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
      {!computer && <FirstLaunchNote />}
    </DesignProviders>
  );
  if (computer) {
    return (
      <DesignPage style={pageStyle(theme)}>
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
