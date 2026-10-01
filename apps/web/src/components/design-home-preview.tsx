import { css } from "styled-system/css";

import type { Schedule } from "../lib/design-days";
import { useDevice } from "../lib/design-device";
import { usePatterns } from "../lib/design-patterns";
import { useSettings } from "../lib/design-settings-store";
import { widgetEntry } from "../lib/design-widgets";
import { Fit } from "./design-home-screen";
import { useColorScheme } from "./design-theme";
import { SampleTag } from "./design-ui";
import { wallpaperFor, WidgetFrame } from "./design-widget-frame";
import { TwoWeeksMedium } from "./design-widgets";

// The widths the medium widget is laid out at, for fitting it in.
const IOS_MEDIUM_WIDTH = 338;
const ANDROID_MEDIUM_WIDTH = 373;

// The home screen's page of the style preview: the wallpaper edge to
// edge, the widget in the middle of it.
const homePreview = {
  // Unclipped, so the tag can sit on the top edge.
  root: css({ minHeight: "100%", pointerEvents: "none", position: "relative" }),
  wallpaper: css({
    alignItems: "center",
    border: "1px solid token(colors.separator)",
    borderRadius: "2xl",
    display: "flex",
    justifyContent: "center",
    minHeight: "100%",
    overflow: "hidden",
    padding: "28px 12px 12px",
  }),
};

// The two weeks' widget on the device's wallpaper, drawn from the same
// made-up fortnight as the calendar beside it. Kept apart from the
// settings so the widgets load only with the preview.
export function HomePreview({
  schedule,
  today,
}: {
  schedule: Schedule;
  today: Date;
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
  return (
    <div aria-hidden="true" className={homePreview.root} inert>
      <div
        className={homePreview.wallpaper}
        style={{ background: wallpaperFor(placement) }}
      >
        <Fit width={android ? ANDROID_MEDIUM_WIDTH : IOS_MEDIUM_WIDTH}>
          <WidgetFrame
            {...placement}
            family={android ? "android4x2" : "systemMedium"}
          >
            <TwoWeeksMedium entry={entry} />
          </WidgetFrame>
        </Fit>
      </div>
      <SampleTag label="ウィジェット" />
    </div>
  );
}
