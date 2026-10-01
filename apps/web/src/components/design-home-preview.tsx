import { useLayoutEffect, useRef, useState } from "react";
import { css } from "styled-system/css";

import type { Schedule } from "../lib/design-days";
import { useDevice } from "../lib/design-device";
import { usePatterns } from "../lib/design-patterns";
import { useSettings } from "../lib/design-settings-store";
import { widgetEntry } from "../lib/design-widgets";
import { useColorScheme } from "./design-theme";
import { wallpaperFor, WidgetFrame } from "./design-widget-frame";
import { TwoWeeksMedium } from "./design-widgets";

// The medium widget's size as laid out, for fitting it in.
const IOS_MEDIUM = { height: 158, width: 338 };
const ANDROID_MEDIUM = { height: 202, width: 373 };
// Room kept round the widget: on top for the tag and the light and dark
// switch, at the sides and foot for the wallpaper to show.
const ROOM = { bottom: 12, side: 12, top: 28 };

// The home screen's page of the style preview: the wallpaper edge to
// edge, the widget in the middle of it.
const homePreview = {
  root: css({ pointerEvents: "none" }),
  wallpaper: css({
    border: "1px solid token(colors.separator)",
    borderRadius: "2xl",
    height: "100%",
    overflow: "hidden",
    position: "relative",
  }),
  // The widget, scaled to fit the room inside and centered in it.
  widget: css({
    left: "50%",
    position: "absolute",
    transformOrigin: "center",
  }),
};

// The two weeks' widget on the device's wallpaper, drawn from the same
// made-up fortnight as the calendar beside it. Kept apart from the
// settings so the widgets load only with the preview.
export function HomePreview({
  schedule,
  today,
  height,
}: {
  schedule: Schedule;
  today: Date;
  // The calendar page's height beside it, which this page keeps.
  height?: number;
}) {
  const platform = useDevice((state) => state.platform);
  const hue = useDevice((state) => state.wallpaperHue);
  const week = useSettings((state) => state.device.week);
  const book = usePatterns();
  const scheme = useColorScheme();
  const android = platform === "android";
  const placement = {
    appearance: scheme,
    wallpaperHue: android ? hue : undefined,
  };
  const entry = widgetEntry(schedule, week, today, book);
  const size = android ? ANDROID_MEDIUM : IOS_MEDIUM;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) {
      return undefined;
    }
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => {
      setWidth(element.clientWidth);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const tall = height ?? size.height + ROOM.top + ROOM.bottom;
  const scale = Math.min(
    1,
    (width - 2 * ROOM.side) / size.width,
    (tall - ROOM.top - ROOM.bottom) / size.height
  );
  const top =
    ROOM.top + (tall - ROOM.top - ROOM.bottom - size.height * scale) / 2;
  return (
    <div
      aria-hidden="true"
      className={homePreview.root}
      inert
      style={{ height: tall }}
    >
      <div
        className={homePreview.wallpaper}
        ref={box}
        style={{ background: wallpaperFor(placement) }}
      >
        {width > 0 && (
          <div
            className={homePreview.widget}
            style={{
              top,
              transform: `translateX(-50%) scale(${scale})`,
              transformOrigin: "top center",
            }}
          >
            <WidgetFrame
              {...placement}
              family={android ? "android4x2" : "systemMedium"}
            >
              <TwoWeeksMedium entry={entry} />
            </WidgetFrame>
          </div>
        )}
      </div>
    </div>
  );
}
