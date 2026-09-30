import { createFileRoute } from "@tanstack/react-router";
import { css } from "styled-system/css";

import { initialDesignSchedule } from "../components/design-calendar";
import { FrameSection, frameSections } from "../components/design-frames";
import {
  DesignIntro,
  DesignPage,
  DesignToolbar,
} from "../components/design-page";
import {
  DesignProviders,
  useDesignTheme,
} from "../components/design-providers";
import { pageStyle } from "../components/design-theme";
import {
  homeAppearances,
  LabelledWidget,
  Wallpaper,
} from "../components/design-widget-frame";
import type { HomeAppearance } from "../components/design-widget-frame";
import {
  MonthWidget,
  TodayCircular,
  TodayInline,
  TodayWidget,
  UpcomingRectangular,
  WeekWidget,
} from "../components/design-widgets";
import { useSettings } from "../lib/design-settings-store";
import { designToday } from "../lib/design-today";
import { widgetEntry } from "../lib/design-widgets";
import type { WidgetEntry } from "../lib/design-widgets";
import { wallpaperSamples } from "../lib/material-you";
import { pageMeta } from "../lib/site";

export const Route = createFileRoute("/design_/widgets")({
  component: WidgetsPage,
  head: () => ({
    ...pageMeta(
      "ウィジェット",
      "ポチカルのホーム画面とロック画面のウィジェット",
      "/design/widgets",
      true
    ),
  }),
});

const sampleSchedule = initialDesignSchedule();

const rows = css({ display: "flex", flexDirection: "column", gap: "16px" });

// Android's launcher has light and dark.
const androidAppearances = homeAppearances.filter(
  ({ appearance }) => appearance === "light" || appearance === "dark"
);

const rowLabel = css({
  color: "text.tertiary",
  fontSize: "12px",
  margin: "0 0 8px 4px",
});

// Android's sizes on a sample wallpaper, whose colors the widgets take.
// The large one is shown on the first wallpaper only, to keep the page
// short.
function AndroidRow({
  appearance,
  entry,
  label,
  large,
  wallpaperHue,
}: {
  appearance: HomeAppearance;
  entry: WidgetEntry;
  label: string;
  large: boolean;
  wallpaperHue: number;
}) {
  const placement = { appearance, wallpaperHue };
  return (
    <section aria-label={label}>
      <p className={rowLabel}>{label}</p>
      <Wallpaper {...placement}>
        <LabelledWidget {...placement} family="android2x2">
          <TodayWidget entry={entry} />
        </LabelledWidget>
        <LabelledWidget {...placement} family="android4x2">
          <WeekWidget entry={entry} />
        </LabelledWidget>
        {large && (
          <LabelledWidget {...placement} family="android4x4">
            <MonthWidget entry={entry} />
          </LabelledWidget>
        )}
      </Wallpaper>
    </section>
  );
}

// The home screen's three sizes, on one stretch of wallpaper.
function HomeRow({
  appearance,
  entry,
}: {
  appearance: HomeAppearance;
  entry: WidgetEntry;
}) {
  return (
    <Wallpaper appearance={appearance}>
      <LabelledWidget appearance={appearance} family="systemSmall">
        <TodayWidget entry={entry} />
      </LabelledWidget>
      <LabelledWidget appearance={appearance} family="systemMedium">
        <WeekWidget entry={entry} />
      </LabelledWidget>
      <LabelledWidget appearance={appearance} family="systemLarge">
        <MonthWidget entry={entry} />
      </LabelledWidget>
    </Wallpaper>
  );
}

// Every widget at its real size, in each look the system gives it. The
// widgets draw from one entry, worked out from the sample person on the
// prototype's today, as the native widgets will from theirs.
function WidgetsPage() {
  const theme = useDesignTheme();
  const week = useSettings((state) => state.device.week);
  const entry = widgetEntry(sampleSchedule, week, designToday);
  const empty = widgetEntry({}, week, designToday);
  return (
    <DesignPage style={pageStyle(theme)}>
      <DesignToolbar back="documents" />
      <DesignIntro eyebrow="POCHICAL / WIDGETS" title="ウィジェット">
        iPhone（390×844pt）と Pixel 9a
        での実寸です。色合いとクリアは、システムが白一色にする見え方の再現です。
      </DesignIntro>
      <DesignProviders>
        <div className={frameSections}>
          <FrameSection
            description="ライト・ダークはそのままの色。色合い・クリアでは背景が差し替わり、中身は白一色の濃淡になります。"
            title="ホーム画面"
          >
            <div className={rows}>
              {homeAppearances.map(({ appearance, label }) => (
                <section aria-label={label} key={appearance}>
                  <HomeRow appearance={appearance} entry={entry} />
                </section>
              ))}
            </div>
          </FrameSection>

          <FrameSection
            description="背景はなく、灰色の濃淡で壁紙の上に出ます。"
            title="ロック画面"
          >
            <Wallpaper appearance="lock">
              <LabelledWidget appearance="lock" family="accessoryCircular">
                <TodayCircular entry={entry} />
              </LabelledWidget>
              <LabelledWidget appearance="lock" family="accessoryRectangular">
                <UpcomingRectangular entry={entry} />
              </LabelledWidget>
              <LabelledWidget appearance="lock" family="accessoryInline">
                <TodayInline entry={entry} />
              </LabelledWidget>
            </Wallpaper>
          </FrameSection>

          <FrameSection
            description="Pixel 9a のランチャーのマス目で。地と文字は壁紙から取った色（Material You）、シフトのマークはテーマの色のままです。"
            title="Android のホーム画面"
          >
            <div className={rows}>
              {wallpaperSamples.flatMap((sample, index) =>
                androidAppearances.map(({ appearance, label }) => (
                  <AndroidRow
                    appearance={appearance}
                    entry={entry}
                    key={`${sample.hue}-${appearance}`}
                    label={`${sample.name}の壁紙・${label}`}
                    large={index === 0}
                    wallpaperHue={sample.hue}
                  />
                ))
              )}
            </div>
          </FrameSection>

          <FrameSection title="予定が入っていないとき">
            <HomeRow appearance="light" entry={empty} />
          </FrameSection>
        </div>
      </DesignProviders>
    </DesignPage>
  );
}
