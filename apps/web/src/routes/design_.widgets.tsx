import { createFileRoute } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { css } from "styled-system/css";

import { dateKey, initialDesignSchedule } from "../components/design-calendar";
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
import type {
  HomeAppearance,
  WidgetFamily,
} from "../components/design-widget-frame";
import {
  CalendarLarge,
  CalendarMedium,
  CalendarSmall,
  DetailMedium,
  DetailSmall,
  TodayCircular,
  TodayInline,
  UpcomingMedium,
  UpcomingRectangular,
  UpcomingSmall,
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

// The sample month, with today a work day that has a memo and people
// with it, so every widget has something to show.
const sampleSchedule = {
  ...initialDesignSchedule(),
  [dateKey(designToday)]: {
    end: "20:00",
    members: ["田中", "山本"],
    note: "新人さん同行。17時から棚卸しの打ち合わせ",
    shift: "day" as const,
  },
};

// Today with a long memo and six people, to see how both give way.
const crowdedSchedule = {
  ...sampleSchedule,
  [dateKey(designToday)]: {
    end: "20:00",
    members: ["田中", "山本", "佐藤", "鈴木", "高橋", "伊藤"],
    note: "新人さん同行。17時から棚卸しの打ち合わせ。帰りに備品の発注を確認して、明日の申し送りに書いておく",
    shift: "day" as const,
  },
};

type Size = "small" | "medium" | "large";
type WidgetView = ComponentType<{ entry: WidgetEntry }>;

// The kinds a person picks from the widget gallery, each in its sizes.
const kinds: {
  name: string;
  description: string;
  sizes: { size: Size; View: WidgetView }[];
}[] = [
  {
    description:
      "今日と、この先の日。小は続く3日、中は今週と来週の2週間を曜日の列に揃えて。",
    name: "これから",
    sizes: [
      { View: UpcomingSmall, size: "small" },
      { View: UpcomingMedium, size: "medium" },
    ],
  },
  {
    description:
      "小は休みの日だけをタイルで。中は月の横に今日から3日分、大は毎日のマークまで。",
    name: "カレンダー",
    sizes: [
      { View: CalendarSmall, size: "small" },
      { View: CalendarMedium, size: "medium" },
      { View: CalendarLarge, size: "large" },
    ],
  },
  {
    description: "今日の時間と、メモ、一緒に働く人。",
    name: "今日の詳細",
    sizes: [
      { View: DetailSmall, size: "small" },
      { View: DetailMedium, size: "medium" },
    ],
  },
];

const iosFamilies: Record<Size, WidgetFamily> = {
  large: "systemLarge",
  medium: "systemMedium",
  small: "systemSmall",
};
const androidFamilies: Record<Size, WidgetFamily> = {
  large: "android4x4",
  medium: "android4x2",
  small: "android2x2",
};

const everyWidget = kinds.flatMap(({ name, sizes }) =>
  sizes.map((widget) => ({ ...widget, kind: name }))
);

const rows = css({ display: "flex", flexDirection: "column", gap: "16px" });
const rowLabel = css({
  color: "text.tertiary",
  fontSize: "12px",
  margin: "0 0 8px 4px",
});

// Light and dark, which the home screen and the launcher both have; then
// the looks the iPhone recolors itself.
const fullColor = homeAppearances.filter(
  ({ appearance }) => appearance === "light" || appearance === "dark"
);
const systemColored = homeAppearances.filter(
  ({ appearance }) => appearance === "tinted" || appearance === "clear"
);

// Widgets on one stretch of wallpaper, under a label.
function WidgetRow({
  label,
  appearance,
  wallpaperHue,
  families,
  widgets,
  entry,
}: {
  label: string;
  appearance: HomeAppearance;
  wallpaperHue?: number;
  families: Record<Size, WidgetFamily>;
  widgets: { size: Size; View: WidgetView; kind?: string }[];
  entry: WidgetEntry;
}) {
  const placement = { appearance, wallpaperHue };
  return (
    <section aria-label={label}>
      <p className={rowLabel}>{label}</p>
      <Wallpaper {...placement}>
        {widgets.map(({ size, View, kind }) => (
          <LabelledWidget
            {...placement}
            family={families[size]}
            key={`${kind ?? ""}-${size}`}
          >
            <View entry={entry} />
          </LabelledWidget>
        ))}
      </Wallpaper>
    </section>
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
  const crowded = widgetEntry(crowdedSchedule, week, designToday);
  const detailSizes =
    kinds.find(({ name }) => name === "今日の詳細")?.sizes ?? [];
  return (
    <DesignPage style={pageStyle(theme)}>
      <DesignToolbar back="documents" />
      <DesignIntro eyebrow="POCHICAL / WIDGETS" title="ウィジェット">
        iPhone（390×844pt）と Pixel 9a
        での実寸です。マークがシフトを表すので、横の文字は時間です。名前は時間のないシフトにだけ出します。
      </DesignIntro>
      <DesignProviders>
        <div className={frameSections}>
          {kinds.map(({ name, description, sizes }) => (
            <FrameSection description={description} key={name} title={name}>
              <div className={rows}>
                {fullColor.map(({ appearance, label }) => (
                  <WidgetRow
                    appearance={appearance}
                    entry={entry}
                    families={iosFamilies}
                    key={appearance}
                    label={label}
                    widgets={sizes}
                  />
                ))}
              </div>
            </FrameSection>
          ))}

          <FrameSection
            description="iPhone の色合いとクリアでは、背景が差し替わり、中身は白一色の濃淡になります。"
            title="色合い・クリア"
          >
            <div className={rows}>
              {systemColored.map(({ appearance, label }) => (
                <WidgetRow
                  appearance={appearance}
                  entry={entry}
                  families={iosFamilies}
                  key={appearance}
                  label={label}
                  widgets={everyWidget}
                />
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
            description="Pixel 9a のランチャーのマス目で。地はほぼ白、文字は壁紙から取った色（Material You）、シフトのマークはテーマの色のままです。"
            title="Android のホーム画面"
          >
            <div className={rows}>
              {wallpaperSamples.flatMap((sample, index) =>
                fullColor.map(({ appearance, label }) => (
                  <WidgetRow
                    appearance={appearance}
                    entry={entry}
                    families={androidFamilies}
                    key={`${sample.hue}-${appearance}`}
                    label={`${sample.name}の壁紙・${label}`}
                    wallpaperHue={sample.hue}
                    // The large one on the first wallpaper only, to keep
                    // the page short.
                    widgets={everyWidget.filter(
                      ({ size }) => index === 0 || size !== "large"
                    )}
                  />
                ))
              )}
            </div>
          </FrameSection>

          <FrameSection
            description="長いメモは行数で切り、一緒に働く人は入るだけの名前と「ほか◯人」に。"
            title="メモが長く、一緒に働く人が多いとき"
          >
            <div className={rows}>
              <WidgetRow
                appearance="light"
                entry={crowded}
                families={iosFamilies}
                label="iPhone"
                widgets={detailSizes}
              />
              <WidgetRow
                appearance="light"
                entry={crowded}
                families={androidFamilies}
                label="Android"
                wallpaperHue={wallpaperSamples[0].hue}
                widgets={detailSizes}
              />
            </div>
          </FrameSection>

          <FrameSection title="予定が入っていないとき">
            <WidgetRow
              appearance="light"
              entry={empty}
              families={iosFamilies}
              label="ライト"
              widgets={everyWidget}
            />
          </FrameSection>
        </div>
      </DesignProviders>
    </DesignPage>
  );
}
