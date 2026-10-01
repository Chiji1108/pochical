import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode, ComponentType } from "react";
import { css } from "styled-system/css";

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
import { VariantPanel } from "../components/design-variant-panel";
import { WeekSettingsContext } from "../components/design-week";
import { LabelledWidget, Wallpaper } from "../components/design-widget-frame";
import type { WidgetFamily } from "../components/design-widget-frame";
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
  ShiftMarkStyleContext,
} from "../components/shift-mark";
import { addDays, dateKey, initialDesignSchedule } from "../lib/design-days";
import type { DayEntry, Schedule } from "../lib/design-days";
import { presetPatterns } from "../lib/design-patterns";
import { designToday } from "../lib/design-today";
import {
  parseWidgetVariants,
  widgetVariantKeys,
  widgetVariantOptions,
} from "../lib/design-widget-variants";
import type { WidgetVariants } from "../lib/design-widget-variants";
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
  validateSearch: parseWidgetVariants,
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

// Days off without their tint, as when 休みを塗る is off.
const noHighlight = {
  highlight: { badge: false, emoji: false, icon: false },
};

// Names under the marks, as when the person shows them in the calendar.
const namesShown = { names: { badge: true, emoji: true, icon: true } };

// The people 次の休み can be set to meet: a partner off at weekends, a
// mother off on Tuesdays, Thursdays and weekends, and someone who has
// entered nothing yet.
function companionOf(member: typeof partner): WidgetCompanion {
  return {
    name: member.name,
    offOn: (date) => {
      const pattern = patternOn(member, date);
      return pattern && pattern.off;
    },
    photo: member.photo,
  };
}
const companions: Record<
  WidgetVariants["companion"],
  WidgetCompanion | undefined
> = {
  mother: companionOf(mother),
  none: undefined,
  notEntered: { name: "あや", offOn: () => undefined },
  partner: companionOf(partner),
};

// Today as 今日 asks; the rest of the sample stays as it is.
const todayKey = dateKey(designToday);
const tomorrowKey = dateKey(addDays(designToday, 1));
const plainDay: DayEntry = { shift: "day" };
function scheduleFor(day: WidgetVariants["day"]): Schedule {
  const days: Record<WidgetVariants["day"], Schedule> = {
    blank: { [todayKey]: undefined },
    busy: {},
    crowded: crowdedSchedule,
    early: { [todayKey]: { shift: "day", start: "07:00" } },
    empty: {},
    off: { [todayKey]: { shift: "off" } },
    offTomorrow: { [todayKey]: plainDay, [tomorrowKey]: { shift: "off" } },
    plain: { [todayKey]: plainDay },
  };
  if (day === "empty") {
    return {};
  }
  return { ...sampleSchedule, ...days[day] };
}

type Size = "small" | "medium" | "large";
type WidgetView = ComponentType<{ entry: WidgetEntry }>;

// The kinds a person picks from the widget gallery, each in its sizes.
const kinds: {
  id: Exclude<WidgetVariants["kind"], "all" | "lock">;
  name: string;
  description: string;
  sizes: { size: Size; View: WidgetView }[];
}[] = [
  {
    description:
      "今日のマークと早出・残業。小はメモの1行目まで、中は今日と明日（何もない日は大きい日付と、明日・次の休み）。",
    id: "today",
    name: "今日",
    sizes: [
      { View: TodaySmall, size: "small" },
      { View: TodayMedium, size: "medium" },
    ],
  },
  {
    description:
      "次の休みまであと何日か。中はその先の休みも。ウィジェットの編集で人を選ぶと、その人と一緒に休める日になります。今日が休みの日は数えずに「おやすみ」。",
    id: "nextOff",
    name: "次の休み",
    sizes: [
      { View: NextOffSmall, size: "small" },
      { View: NextOffMedium, size: "medium" },
    ],
  },
  {
    description:
      "今日から4日、1日1行。中は曜日と、早出・残業かメモをマークの横に。",
    id: "list",
    name: "リスト",
    sizes: [
      { View: ListSmall, size: "small" },
      { View: ListMedium, size: "medium" },
    ],
  },
  {
    description:
      "中は今週と来週の2週間、大は月。アプリのカレンダーと同じ日のマスで。",
    id: "calendar",
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

const page = {
  caption: css({ color: "text.secondary", fontSize: "12px", margin: 0 }),
  kind: css({ display: "flex", flexDirection: "column", gap: "8px" }),
  kindName: css({ fontSize: "15px", fontWeight: 700, margin: 0 }),
  // The choices beside the widgets on a wide screen, kept in view as the
  // widgets scroll; above them on a narrow one.
  layout: css({
    "@media (min-width: 1100px)": {
      alignItems: "flex-start",
      display: "grid",
      gridTemplateColumns: "380px 1fr",
    },
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    padding: "8px 16px 48px",
  }),
  panel: css({
    "@media (min-width: 1100px)": { position: "sticky", top: "16px" },
  }),
  stage: css({ display: "flex", flexDirection: "column", gap: "32px" }),
};

// Every mark in the テーマ's one color, as シフトの色 ワントーン.
const monochromeOn = { monochrome: true };
const monochromeOff = { monochrome: false };
const namesHidden = { names: { badge: false, emoji: false, icon: false } };
const highlightOn = { highlight: { badge: true, emoji: true, icon: true } };

// The person's settings as the choices set them, around the widgets.
function SettingsAround({
  variants,
  children,
}: {
  variants: WidgetVariants;
  children: ReactNode;
}) {
  const style = shapeStyles[variants.shape];
  const week = weekOf(variants);
  return (
    <PresetContexts id={variants.theme}>
      <WeekSettingsContext
        value={{ english: variants.language === "en", week }}
      >
        <MonochromeContext
          value={variants.shiftColors === "mono" ? monochromeOn : monochromeOff}
        >
          <ShiftMarkStyleContext value={style}>
            <IconWeightContext
              value={variants.shape === "line" ? "regular" : "duotone"}
            >
              <CellNamesContext
                value={variants.names === "shown" ? namesShown : namesHidden}
              >
                <OffHighlightContext
                  value={
                    variants.offLook === "plain" ? noHighlight : highlightOn
                  }
                >
                  <OffDisplayContext
                    value={variants.offLook === "blank" ? "blank" : "show"}
                  >
                    {children}
                  </OffDisplayContext>
                </OffHighlightContext>
              </CellNamesContext>
            </IconWeightContext>
          </ShiftMarkStyleContext>
        </MonochromeContext>
      </WeekSettingsContext>
    </PresetContexts>
  );
}

// 土日祝's coloring as chosen, on a week from Sunday.
function weekOf(variants: WidgetVariants) {
  const colored = variants.weekend === "colored";
  return {
    colored: { holiday: colored, saturday: colored, sunday: colored },
    weekStart: 0,
  };
}

const shapeStyles = {
  badge: "badge",
  emoji: "emoji",
  fill: "icon",
  line: "icon",
} as const;

// The widgets of one kind, or all, on the device's home screen as the
// choices set it.
function Stage({ variants }: { variants: WidgetVariants }) {
  const android = variants.platform === "android";
  const week = weekOf(variants);
  const august = variants.month === "august";
  const entry = widgetEntry(
    august ? augustSchedule : scheduleFor(variants.day),
    week,
    august ? augustDay : designToday,
    presetPatterns,
    companions[variants.companion]
  );
  const placement = {
    appearance: variants.look,
    wallpaperHue: android
      ? (
          wallpaperSamples.find(({ id }) => id === variants.wallpaper) ??
          wallpaperSamples[0]
        ).hue
      : undefined,
  };
  const families = android ? androidFamilies : iosFamilies;
  if (variants.kind === "lock") {
    return (
      <div className={page.kind}>
        <h2 className={page.kindName}>ロック画面</h2>
        <p className={page.caption}>
          iPhone のロック画面。背景はなく、灰色の濃淡で壁紙の上に出ます。
        </p>
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
      </div>
    );
  }
  const shown =
    variants.kind === "all"
      ? kinds
      : kinds.filter(({ id }) => id === variants.kind);
  return (
    <div className={page.stage}>
      {shown.map(({ id, name, description, sizes }) => (
        <div className={page.kind} key={id}>
          <h2 className={page.kindName}>{name}</h2>
          <p className={page.caption}>{description}</p>
          <Wallpaper {...placement}>
            {sizes.map(({ size, View }) => (
              <LabelledWidget {...placement} family={families[size]} key={size}>
                <View entry={entry} />
              </LabelledWidget>
            ))}
          </Wallpaper>
        </div>
      ))}
    </div>
  );
}

// The widgets at their real size, switched between their kinds, the day
// they show, the device and the person's settings, as /demo switches the
// app. Each widget draws from one entry, worked out from the sample
// person, as the native widgets will from theirs.
function WidgetsPage() {
  const variants = Route.useSearch();
  const navigate = Route.useNavigate();
  const theme = useDesignTheme();
  return (
    <DesignPage style={pageStyle(theme)}>
      <DesignToolbar back="documents" />
      <DesignIntro eyebrow="POCHICAL / WIDGETS" title="ウィジェット">
        iPhone（390×844pt）と Pixel 9a
        での実寸です。下の切り替えで、種類、今日の状態、端末と見た目、アプリの設定を変えて見られます。選んだ状態は
        URL に残ります。
      </DesignIntro>
      <DesignProviders>
        <div className={page.layout}>
          <div className={page.panel}>
            <VariantPanel
              onChange={(key, value) => {
                void navigate({
                  replace: true,
                  resetScroll: false,
                  search: (previous) => ({ ...previous, [key]: value }),
                });
              }}
              options={widgetVariantOptions}
              order={widgetVariantKeys}
              title="切り替え"
              variants={variants}
            />
          </div>
          <SettingsAround variants={variants}>
            <Stage variants={variants} />
          </SettingsAround>
        </div>
      </DesignProviders>
    </DesignPage>
  );
}
