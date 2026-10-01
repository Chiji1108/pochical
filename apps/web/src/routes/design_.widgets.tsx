import { createFileRoute } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { css } from "styled-system/css";

import { FrameSection, frameSections } from "../components/design-frames";
import { mother, partner, patternOn } from "../components/design-group-data";
import {
  DesignIntro,
  DesignPage,
  DesignToolbar,
} from "../components/design-page";
import {
  DesignProviders,
  PresetContexts,
  useDesignTheme,
} from "../components/design-providers";
import { pageStyle } from "../components/design-theme";
import { WeekSettingsContext } from "../components/design-week";
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
  ListMedium,
  ListSmall,
  NextOffCircular,
  NextOffMedium,
  NextOffSmall,
  TodayCircular,
  TodayInline,
  TodayMedium,
  TodaySmall,
  TwoWeeksMedium,
  UpcomingRectangular,
} from "../components/design-widgets";
import {
  CellNamesContext,
  IconWeightContext,
  MonochromeContext,
  OffDisplayContext,
  OffHighlightContext,
} from "../components/shift-mark";
import { addDays, dateKey, initialDesignSchedule } from "../lib/design-days";
import type { DayEntry, Schedule } from "../lib/design-days";
import { presetPatterns } from "../lib/design-patterns";
import { useSettings } from "../lib/design-settings-store";
import { designToday } from "../lib/design-today";
import { widgetEntry } from "../lib/design-widgets";
import type { WidgetCompanion, WidgetEntry } from "../lib/design-widgets";
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

// The sample month and the next, with today a work day that has a memo
// and people with it, so every widget has something to show.
const OCTOBER = 9;
const sampleSchedule = {
  ...initialDesignSchedule(),
  ...initialDesignSchedule(4, OCTOBER),
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

// August 2026 starts on a Saturday, so its month is six weeks tall: the
// large カレンダー at its fullest.
const AUGUST = 7;
const augustDay = new Date(2026, AUGUST, 24);
const augustSchedule = initialDesignSchedule(4, AUGUST);

// Every mark in the テーマ's one color, as シフトの色 ワントーン.
const monochrome = { monochrome: true };

// Days off without their tint, as when 休みを塗る is off.
const noHighlight = {
  highlight: { badge: false, emoji: false, icon: false },
};

// Names under the marks, as when the person shows them in the calendar.
const namesShown = { names: { badge: true, emoji: true, icon: true } };

// The people 次の休み can be set to meet: a partner off at weekends, and
// a mother off on Tuesdays, Thursdays and weekends.
const companions: WidgetCompanion[] = [partner, mother].map((member) => ({
  name: member.name,
  offOn: (date) => {
    const pattern = patternOn(member, date);
    return pattern && pattern.off;
  },
  photo: member.photo,
}));

// Today as it can be, a row each, to see what every widget then says. The
// rest of the sample stays as it is.
const todayKey = dateKey(designToday);
const tomorrowKey = dateKey(addDays(designToday, 1));
function withDays(days: Record<string, DayEntry | undefined>): Schedule {
  return { ...sampleSchedule, ...days };
}
const plainDay: DayEntry = { shift: "day" };
// Someone who has not entered their shifts yet.
const notEntered: WidgetCompanion = { name: "あや", offOn: () => undefined };
const todayStates: {
  label: string;
  schedule: Schedule;
  companion?: WidgetCompanion;
}[] = [
  {
    label: "ふつうの日（変更もメモもなし）",
    schedule: withDays({ [todayKey]: plainDay }),
  },
  {
    label: "早出",
    schedule: withDays({ [todayKey]: { shift: "day", start: "07:00" } }),
  },
  { label: "今日が休み", schedule: withDays({ [todayKey]: { shift: "off" } }) },
  {
    label: "明日が休み",
    schedule: withDays({
      [todayKey]: plainDay,
      [tomorrowKey]: { shift: "off" },
    }),
  },
  { label: "今日が未入力", schedule: withDays({ [todayKey]: undefined }) },
  {
    companion: notEntered,
    label: "一緒に休める日が見つからない（相手が未入力）",
    schedule: sampleSchedule,
  },
];

// Today off, alone and with someone off too.
const restSchedule = withDays({ [todayKey]: { shift: "off" } });
const restCompanion: WidgetCompanion = {
  name: "ゆうき",
  offOn: () => true,
  photo: partner.photo,
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
      "今日のマークと早出・残業。小はメモの1行目まで、中はメモと一緒に働く人も。",
    name: "今日",
    sizes: [
      { View: TodaySmall, size: "small" },
      { View: TodayMedium, size: "medium" },
    ],
  },
  {
    description:
      "次の休みまであと何日か。中はその先の休みも。ウィジェットの編集で人を選ぶと、その人と一緒に休める日になります。",
    name: "次の休み",
    sizes: [
      { View: NextOffSmall, size: "small" },
      { View: NextOffMedium, size: "medium" },
    ],
  },
  {
    description:
      "今日から4日、1日1行。中は曜日と、早出・残業かメモをマークの横に。",
    name: "リスト",
    sizes: [
      { View: ListSmall, size: "small" },
      { View: ListMedium, size: "medium" },
    ],
  },
  {
    description: "中は今週と来週の2週間、大は月。",
    name: "カレンダー",
    sizes: [
      { View: TwoWeeksMedium, size: "medium" },
      { View: CalendarLarge, size: "large" },
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

// Where days off show: the small month, the two weeks and the large month.
const offWidgets = everyWidget.filter(({ kind }) => kind === "カレンダー");
// The small ones a day off today changes.
const restWidgets = everyWidget.filter(
  ({ kind, size }) =>
    size === "small" && (kind === "今日" || kind === "次の休み")
);

// Every widget that today changes: all but カレンダー.
const stateWidgets = everyWidget.filter(({ kind }) => kind !== "カレンダー");

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
  const entry = widgetEntry(sampleSchedule, week, designToday, presetPatterns);
  const empty = widgetEntry({}, week, designToday, presetPatterns);
  const crowded = widgetEntry(
    crowdedSchedule,
    week,
    designToday,
    presetPatterns
  );
  const august = widgetEntry(augustSchedule, week, augustDay, presetPatterns);
  const named = everyWidget.filter(
    ({ kind, size }) =>
      kind === "カレンダー" ||
      (kind === "リスト" && size === "medium") ||
      (kind === "今日" && size === "small")
  );
  const detailSizes = kinds.find(({ name }) => name === "今日")?.sizes ?? [];
  const together = companions.map((companion) => ({
    entry: widgetEntry(
      sampleSchedule,
      week,
      designToday,
      presetPatterns,
      companion
    ),
    name: companion.name,
  }));
  const offSizes = kinds.find(({ name }) => name === "次の休み")?.sizes ?? [];
  const restDay = widgetEntry(restSchedule, week, designToday, presetPatterns);
  const restTogether = widgetEntry(
    restSchedule,
    week,
    designToday,
    presetPatterns,
    restCompanion
  );
  // 墨 as someone keeping everything one tone would set it: no color for
  // Sundays, Saturdays or holidays either.
  const plainWeek = {
    ...week,
    colored: { holiday: false, saturday: false, sunday: false },
  };
  const plainStates = todayStates.map((state) => ({
    ...state,
    entry: widgetEntry(
      state.schedule,
      plainWeek,
      designToday,
      presetPatterns,
      state.companion
    ),
  }));
  const states = todayStates.map((state) => ({
    ...state,
    entry: widgetEntry(
      state.schedule,
      week,
      designToday,
      presetPatterns,
      state.companion
    ),
  }));
  return (
    <DesignPage style={pageStyle(theme)}>
      <DesignToolbar back="documents" />
      <DesignIntro eyebrow="POCHICAL / WIDGETS" title="ウィジェット">
        iPhone（390×844pt）と Pixel 9a
        での実寸です。シフトはマークで表し、時間は毎日同じなので出しません。早出・残業の日だけ、変わった時間を出します。
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
            description="今日がどんな日かで、それぞれのウィジェットが何を言うか。カレンダーは今日によって変わらないので外しています。"
            title="今日の状態ごと"
          >
            <div className={rows}>
              {states.map(({ label, entry: shown, companion }) => (
                <WidgetRow
                  appearance="light"
                  entry={shown}
                  families={iosFamilies}
                  key={label}
                  label={label}
                  widgets={companion ? offSizes : stateWidgets}
                />
              ))}
            </div>
          </FrameSection>

          <FrameSection
            description="今日が休みの日の、今日（小）と次の休み（小）。数えずに「おやすみ」と言い、アイコンの犬がのぞきます。"
            title="今日が休みの日"
          >
            <div className={rows}>
              {fullColor.map(({ appearance, label }) => (
                <WidgetRow
                  appearance={appearance}
                  entry={restDay}
                  families={iosFamilies}
                  key={appearance}
                  label={label}
                  widgets={restWidgets}
                />
              ))}
              <WidgetRow
                appearance="light"
                entry={restTogether}
                families={iosFamilies}
                label="一緒に休める日"
                widgets={offSizes.filter(({ size }) => size === "small")}
              />
            </div>
          </FrameSection>

          <FrameSection
            description="墨のテーマで、シフトの色をワントーン、アイコンを線だけ、休みを塗らない、土日祝にも色をつけない設定にしたとき。"
            title="今日の状態ごと（墨・ワントーン・線）"
          >
            <WeekSettingsContext value={{ week: plainWeek }}>
              <PresetContexts id="sumi">
                <MonochromeContext value={monochrome}>
                  <IconWeightContext value="regular">
                    <OffHighlightContext value={noHighlight}>
                      <div className={rows}>
                        {plainStates.map(
                          ({ label, entry: shown, companion }) => (
                            <WidgetRow
                              appearance="light"
                              entry={shown}
                              families={iosFamilies}
                              key={label}
                              label={label}
                              widgets={companion ? offSizes : stateWidgets}
                            />
                          )
                        )}
                      </div>
                    </OffHighlightContext>
                  </IconWeightContext>
                </MonochromeContext>
              </PresetContexts>
            </WeekSettingsContext>
          </FrameSection>

          <FrameSection
            description="次の休みのウィジェットを編集して、グループの人を選んだとき。ふたりとも休みの日だけを数えます。相手がまだ入れていない日は数えません。"
            title="一緒に休める日"
          >
            <div className={rows}>
              {together.flatMap(({ entry: shared, name }) =>
                fullColor.map(({ appearance, label }) => (
                  <WidgetRow
                    appearance={appearance}
                    entry={shared}
                    families={iosFamilies}
                    key={`${name}-${appearance}`}
                    label={`${name}・${label}`}
                    widgets={offSizes}
                  />
                ))
              )}
            </div>
          </FrameSection>

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
              <LabelledWidget appearance="lock" family="accessoryCircular">
                <NextOffCircular entry={entry} />
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

          <FrameSection
            description="カレンダーでマークの下に名前を出している人には、ウィジェットでも出します。2週と大きい月はマークの下に、今日や明日の行はマークの横に。"
            title="シフト名を出しているとき"
          >
            <CellNamesContext value={namesShown}>
              <div className={rows}>
                <WidgetRow
                  appearance="light"
                  entry={entry}
                  families={iosFamilies}
                  label="iPhone"
                  widgets={named}
                />
                <WidgetRow
                  appearance="light"
                  entry={entry}
                  families={androidFamilies}
                  label="Android"
                  wallpaperHue={wallpaperSamples[0].hue}
                  widgets={named}
                />
                <WidgetRow
                  appearance="light"
                  entry={august}
                  families={iosFamilies}
                  label="6週の月（2026年8月）"
                  widgets={named.filter(({ size }) => size === "large")}
                />
              </div>
            </CellNamesContext>
          </FrameSection>

          <FrameSection
            description="休みの日は、カレンダーの「休みを塗る」と「休みの見せ方」のとおりに。空白のとき、2週はカレンダーの週と同じく薄く出します。小さい月は休みしか見せないので、いつも塗ります。"
            title="休みの見せ方"
          >
            <div className={rows}>
              <OffHighlightContext value={noHighlight}>
                <WidgetRow
                  appearance="light"
                  entry={entry}
                  families={iosFamilies}
                  label="塗らない"
                  widgets={offWidgets}
                />
              </OffHighlightContext>
              <OffDisplayContext value="blank">
                <WidgetRow
                  appearance="light"
                  entry={entry}
                  families={iosFamilies}
                  label="空白"
                  widgets={offWidgets}
                />
              </OffDisplayContext>
            </div>
          </FrameSection>

          <FrameSection
            description="カレンダー設定の「月と曜日」を英語にしたとき。見出しの月と曜日が英語になり、9月24日(木) のような文は日本語のままです。"
            title="月と曜日を英語にしたとき"
          >
            <WeekSettingsContext value={{ english: true, week }}>
              <div className={rows}>
                <WidgetRow
                  appearance="light"
                  entry={states[0]?.entry ?? entry}
                  families={iosFamilies}
                  label="iPhone"
                  widgets={everyWidget.filter(
                    ({ kind, size }) =>
                      kind === "リスト" ||
                      kind === "カレンダー" ||
                      (kind === "今日" && size === "medium")
                  )}
                />
              </div>
            </WeekSettingsContext>
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
