import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { css } from "styled-system/css";

import { formatDay } from "../lib/design-days";
import { useDevice } from "../lib/design-device";
import {
  bookOf,
  PatternsContext,
  presetPatterns,
} from "../lib/design-patterns";
import { clockText } from "../lib/design-reminders";
import { useSettings } from "../lib/design-settings-store";
import { designToday } from "../lib/design-today";
import { useShownDays, useUser } from "../lib/design-user-store";
import { widgetEntry } from "../lib/design-widgets";
import { useDeviceScheme } from "../lib/use-device-scheme";
import { AppIcon, useAppIcons } from "./design-app-icon";
import { NotificationBanner } from "./design-notifications";
import { Phone } from "./design-phone";
import { useThemeStyle } from "./design-theme";
import { wallpaperFor, WidgetFrame } from "./design-widget-frame";
import { UpcomingSmall, NextOffSmall, TwoWeeksMedium } from "./design-widgets";

// The phone's home screen beside the app on /demo, with the widgets on it
// drawn from the same person's data, so what is entered in the app shows
// there at once. Like the phone itself it stands in for the device: its
// wallpaper, the other apps and the dock are the system's. It follows the
// computer's own light or dark, as a home screen follows the phone's
// rather than the app's 外観.

// The other apps: plain colors in an icon's shape, a little faded, as the
// app icon study draws neighbors, so none stands for a real app.
const neighbors = ["#f2b233", "#4c8ef7", "#34c759", "#ff7a6b", "#8e8e93"];

// What the home screens are laid out across: the iPhone's between the
// stand-in phone's sides (346 of its 390, as the screens inside get),
// and Android's in dp between the launcher's side margins on a Pixel 9a
// (373 of its 411), drawn to the same room.
const IOS_WIDTH = 346;
const ANDROID_WIDTH = 373;

const home = {
  android: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "16px",
    padding: "16px 0 8px",
  }),
  androidDock: css({
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    justifyItems: "center",
    marginTop: "auto",
    padding: "8px 0",
  }),
  androidRow: css({ display: "flex", gap: "16px", justifyContent: "center" }),
  app: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  }),
  appLabel: css({
    fontSize: "11px",
    fontWeight: 500,
    minHeight: "14px",
  }),
  apps: css({
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    justifyItems: "center",
    width: "100%",
  }),
  // The dock, as iOS 26 draws it: a glass shelf a little off the foot.
  dock: css({
    backdropFilter: "blur(20px)",
    bg: "rgb(255 255 255 / 0.22)",
    borderRadius: "32px",
    boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.3)",
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    justifyItems: "center",
    marginTop: "auto",
    padding: "16px 8px",
    width: "100%",
  }),
  fit: css({ display: "flex", flex: 1, minHeight: 0 }),
  fitted: css({ display: "flex", flex: 1, flexDirection: "column" }),
  // At a Glance, Android's line over the home screen: the date.
  glance: css({
    fontSize: "22px",
    fontWeight: 500,
    padding: "0 8px",
  }),
  ios: css({
    alignItems: "center",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "24px",
    padding: "16px 0 8px",
  }),
  neighbor: css({ opacity: 0.85 }),
  round: css({
    "& img": { display: "block", height: "100%", width: "100%" },
    borderRadius: "999px",
    display: "inline-block",
    flexShrink: 0,
    overflow: "hidden",
  }),
  row: css({ display: "flex", gap: "20px", justifyContent: "center" }),
};

// A home screen laid out across `width`, drawn smaller where the phone
// has less room, since widgets keep their real sizes.
function Fit({ width, children }: { width: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(IOS_WIDTH);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) {
      return undefined;
    }
    // Measured at once, then again as the page's width changes.
    setRoom(element.clientWidth);
    const observer = new ResizeObserver(([change]) => {
      setRoom(change?.contentRect.width ?? IOS_WIDTH);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return (
    <div className={home.fit} ref={box}>
      <div className={home.fitted} style={{ zoom: Math.min(1, room / width) }}>
        {children}
      </div>
    </div>
  );
}

function Neighbor({ index, round }: { index: number; round: boolean }) {
  const color = neighbors[index % neighbors.length];
  return (
    <span
      className={`${home.neighbor} ${round ? home.round : ""}`}
      style={{
        background: color,
        borderRadius: round ? undefined : "22.5%",
        display: "inline-block",
        height: round ? 52 : 60,
        width: round ? 52 : 60,
      }}
    />
  );
}

// ポチカル among the others, in the icon the person picked.
function Apps({ round }: { round: boolean }) {
  const icons = useAppIcons();
  const iconId = useSettings((state) => state.device.appIcon);
  const src = icons[iconId];
  return (
    <div className={home.apps}>
      <span className={home.app}>
        {round ? (
          <span className={home.round} style={{ height: 52, width: 52 }}>
            {src ? <img alt="" height={52} src={src} width={52} /> : null}
          </span>
        ) : (
          <AppIcon size={60} src={src} />
        )}
        <small className={home.appLabel}>ポチカル</small>
      </span>
      {[0, 1, 2].map((index) => (
        <span aria-hidden="true" className={home.app} key={index}>
          <Neighbor index={index} round={round} />
          <small className={home.appLabel} />
        </span>
      ))}
    </div>
  );
}

function Dock({ round }: { round: boolean }) {
  return (
    <div aria-hidden="true" className={round ? home.androidDock : home.dock}>
      {[1, 2, 3, 4].map((index) => (
        <Neighbor index={index} key={index} round={round} />
      ))}
    </div>
  );
}

export function HomeScreen() {
  const platform = useDevice((state) => state.platform);
  const hue = useDevice((state) => state.wallpaperHue);
  const scheme = useDeviceScheme();
  const schedule = useShownDays();
  const patterns = useUser((state) => state.patterns);
  const week = useSettings((state) => state.device.week);
  // The person's own patterns, over the ready-made ones, as the calendar
  // names them.
  const book = { ...presetPatterns, ...bookOf(patterns) };
  const entry = widgetEntry(schedule, week, designToday, book);
  const android = platform === "android";
  const placement = {
    appearance: scheme,
    wallpaperHue: android ? hue : undefined,
  };
  // The status bar and the apps' names, dark over a light wallpaper.
  const ink = scheme === "dark" ? "#ffffff" : "#1c1b1f";
  return (
    <PatternsContext value={book}>
      <section aria-label="ホーム画面">
        <Phone style={{ background: wallpaperFor(placement), color: ink }}>
          {android ? (
            <Fit width={ANDROID_WIDTH}>
              <div className={home.android}>
                <p className={home.glance}>{formatDay(designToday)}</p>
                <WidgetFrame {...placement} family="android4x2">
                  <TwoWeeksMedium entry={entry} />
                </WidgetFrame>
                <div className={home.androidRow}>
                  <WidgetFrame {...placement} family="android2x2">
                    <NextOffSmall entry={entry} />
                  </WidgetFrame>
                  <WidgetFrame {...placement} family="android2x2">
                    <UpcomingSmall entry={entry} />
                  </WidgetFrame>
                </div>
                <Apps round />
                <Dock round />
              </div>
            </Fit>
          ) : (
            <Fit width={IOS_WIDTH}>
              <div className={home.ios}>
                <WidgetFrame {...placement} family="systemMedium">
                  <TwoWeeksMedium entry={entry} />
                </WidgetFrame>
                <div className={home.row}>
                  <WidgetFrame {...placement} family="systemSmall">
                    <NextOffSmall entry={entry} />
                  </WidgetFrame>
                  <WidgetFrame {...placement} family="systemSmall">
                    <UpcomingSmall entry={entry} />
                  </WidgetFrame>
                </div>
                <Apps round={false} />
                <Dock round={false} />
              </div>
            </Fit>
          )}
        </Phone>
      </section>
    </PatternsContext>
  );
}

const lockScreen = {
  clock: css({
    fontSize: "88px",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    letterSpacing: "-2px",
    lineHeight: 1,
    margin: 0,
  }),
  date: css({ fontWeight: 600, margin: 0, textStyle: "title3" }),
  // The time and date at the top, the notification under them, as the
  // lock screen keeps new ones.
  root: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "8px",
    padding: "64px 12px 0",
  }),
  time: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginBottom: "auto",
  }),
  list: css({ marginBottom: "160px" }),
};

// The phone's lock screen with one notification on it, for the flows: the
// system's own screen, on the wallpaper the home screen has.
export function LockScreen({
  when,
  title,
  body,
}: {
  when: Date;
  title: string;
  body?: string;
}) {
  const platform = useDevice((state) => state.platform);
  const hue = useDevice((state) => state.wallpaperHue);
  const scheme = useDeviceScheme();
  const background = wallpaperFor({
    appearance: scheme,
    wallpaperHue: platform === "android" ? hue : undefined,
  });
  // The app's colors, which its notification is drawn in.
  const theme = useThemeStyle();
  // Dark over a light wallpaper, as the status bar is.
  const ink = scheme === "dark" ? "#ffffff" : "#1c1b1f";
  return (
    <Phone locked style={{ ...theme, background, color: ink }}>
      <div className={lockScreen.root}>
        <div className={lockScreen.time}>
          <p className={lockScreen.date}>{formatDay(when)}</p>
          <p className={lockScreen.clock}>{clockText(when)}</p>
        </div>
        <div className={lockScreen.list}>
          <NotificationBanner body={body} title={title} />
        </div>
      </div>
    </Phone>
  );
}
