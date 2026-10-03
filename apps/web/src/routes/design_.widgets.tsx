import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode, ComponentType } from "react";
import { css } from "styled-system/css";

import { changeOn, patternOn } from "../components/design-group-data";
import type { Member } from "../components/design-group-data";
import {
  mother,
  partner,
  sampleGroups,
  sampleOthers,
  samplePhoto,
} from "../components/design-group-samples";
import { Fit, LockScreen } from "../components/design-home-screen";
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
import {
  LabelledWidget,
  Wallpaper,
  WidgetFrame,
  wallpaperFor,
} from "../components/design-widget-frame";
import type { WidgetFamily } from "../components/design-widget-frame";
import {
  CalendarLarge,
  NextOffCircular,
  NextOffMedium,
  NextOffSmall,
  TodayCircular,
  TodayInline,
  SimpleMedium,
  SimpleSmall,
  TwoWeeksMedium,
  UpcomingMedium,
  UpcomingSmall,
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
import type {
  WidgetCompanion,
  WidgetEntry,
  WidgetPerson,
} from "../lib/design-widgets";
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
const augustSchedule = {
  ...initialDesignSchedule(4, AUGUST),
  ...initialDesignSchedule(4, AUGUST + 1),
};

// Days off without their tint, as when 休みを塗る is off.
const noHighlight = {
  highlight: { badge: false, emoji: false, icon: false },
};

// Names under the marks, as when the person shows them in the calendar.
const namesShown = { names: { badge: true, emoji: true, icon: true } };

// Who the widgets can be set to: a partner off at weekends, a mother off
// on Tuesdays, Thursdays and weekends, someone who has entered nothing
// yet, and the sample person's groups: 家族 (those two), 看護学校の友達
// (two nurses on rotating shifts) and 高校の同級生 (nine, all kinds of
// work).
function personOf(member: Member): WidgetPerson {
  return {
    dayOn: (date) => {
      const pattern = patternOn(member, date);
      if (!pattern) {
        return undefined;
      }
      const change = changeOn(member, date);
      return {
        early: change?.early ?? false,
        late: change?.late ?? false,
        look: pattern.look,
        name: pattern.name,
        off: pattern.off,
        time: change?.time ?? pattern.time,
      };
    },
    name: member.name,
    photo: member.photo,
    style: member.style?.look,
  };
}

function groupOf(id: string): WidgetCompanion {
  const group = sampleGroups().find((one) => one.id === id);
  return {
    kind: "group",
    mark: group?.mark ?? { emoji: "👥", kind: "emoji" },
    name: group?.name ?? "",
    people: sampleOthers(id).map(personOf),
  };
}

function companionOf(
  choice: WidgetVariants["companion"]
): WidgetCompanion | undefined {
  switch (choice) {
    case "partner": {
      return { kind: "person", person: personOf(partner) };
    }
    case "mother": {
      return { kind: "person", person: personOf(mother) };
    }
    case "notEntered": {
      return {
        kind: "person",
        person: { dayOn: () => undefined, name: "あや" },
      };
    }
    case "family": {
      return groupOf("family");
    }
    case "friends": {
      return groupOf("friends");
    }
    case "school": {
      return groupOf("school");
    }
    case "none": {
      return undefined;
    }
  }
}

// The sample person, as their groups see them.
const me = { name: "さくら", photo: samplePhoto(1011) };

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
type KindSize = { size: Size; View: WidgetView };

// The kinds a person picks from the widget gallery, each in its sizes.
const kinds: {
  id: Exclude<WidgetVariants["kind"], "all" | "lock">;
  name: string;
  description: string;
  sizes: KindSize[];
}[] = [
  {
    description:
      "その日だけを大きく。小は今日、中は今日と明日。添えるのは変わった時間（早出・残業）だけで、メモは日付の下の線だけ。今日が休みの日は「おやすみ」。",
    id: "simple",
    name: "シンプル",
    sizes: [
      { View: SimpleSmall, size: "small" },
      { View: SimpleMedium, size: "medium" },
    ],
  },
  {
    description:
      "次の休みまであと何日か。中はその先の休みも。ウィジェットの編集で人を選ぶとその人と一緒に休める日、グループを選ぶとみんな休み（全員が休みの日）になります。今日が休みの日は数えずに「おやすみ」。",
    id: "nextOff",
    name: "次の休み",
    sizes: [
      { View: NextOffSmall, size: "small" },
      { View: NextOffMedium, size: "medium" },
    ],
  },
  {
    description:
      "今日からの日を並べて。小は今日と続く3日、中は今日から5日を列で。添えるのは変わった時間だけで、メモは日付の下の線だけ。ウィジェットの編集で人を選ぶと、その人の段が並びます（小は今日と明日）。",
    id: "upcoming",
    name: "これから",
    sizes: [
      { View: UpcomingSmall, size: "small" },
      { View: UpcomingMedium, size: "medium" },
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

// The lock screen at 6:45 on the day shown, as it is looked at before a
// shift.
const LOCK_HOUR = 6;
const LOCK_MINUTE = 45;

// A phone's width, as the flows draw their screens, drawn smaller where
// the page is narrower, since the widgets keep their real sizes.
const PHONE_WIDTH = 390;
const lockPhone = css({ flexShrink: 0, width: `${PHONE_WIDTH}px` });

function lockTime(day: Date) {
  const at = new Date(day);
  at.setHours(LOCK_HOUR, LOCK_MINUTE, 0, 0);
  return at;
}

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
    { companion: companionOf(variants.companion), me }
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
          iPhone
          のロック画面に置いたところ。1行は時計の上の日付の後ろに、円形（72pt）と長方形（160×72pt）は時計の下に。背景はなく、灰色の濃淡で壁紙の上に出ます。
        </p>
        <Fit width={PHONE_WIDTH}>
          <div className={lockPhone}>
            <LockScreen
              ground={wallpaperFor({ appearance: "lock" })}
              inline={
                <WidgetFrame appearance="lock" family="accessoryInline" inLine>
                  <TodayInline entry={entry} />
                </WidgetFrame>
              }
              when={lockTime(entry.today.date)}
              widgets={
                <>
                  <WidgetFrame appearance="lock" family="accessoryCircular">
                    <TodayCircular entry={entry} />
                  </WidgetFrame>
                  <WidgetFrame appearance="lock" family="accessoryCircular">
                    <NextOffCircular entry={entry} />
                  </WidgetFrame>
                  <WidgetFrame appearance="lock" family="accessoryRectangular">
                    <UpcomingRectangular entry={entry} />
                  </WidgetFrame>
                </>
              }
            />
          </div>
        </Fit>
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
