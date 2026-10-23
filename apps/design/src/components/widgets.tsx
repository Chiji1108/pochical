import {
  Fit,
  LockScreen,
} from "@pochical/prototype/components/design-home-screen";
import { PresetContexts } from "@pochical/prototype/components/design-providers";
import { WeekSettingsContext } from "@pochical/prototype/components/design-week";
import {
  LabelledWidget,
  Wallpaper,
  WidgetFrame,
  wallpaperFor,
} from "@pochical/prototype/components/design-widget-frame";
import type { WidgetFamily } from "@pochical/prototype/components/design-widget-frame";
import {
  CalendarLarge,
  TwoWeeksMedium,
} from "@pochical/prototype/components/design-widgets-calendar";
import { NextOffSmall } from "@pochical/prototype/components/design-widgets-next-off";
import {
  SimpleMedium,
  SimpleSmall,
} from "@pochical/prototype/components/design-widgets-simple";
import {
  UpcomingMedium,
  UpcomingSmall,
} from "@pochical/prototype/components/design-widgets-upcoming";
import {
  CellNamesContext,
  IconWeightContext,
  MonochromeContext,
  noOffLooks,
  OffLooksContext,
  ShiftMarkStyleContext,
} from "@pochical/prototype/components/shift-mark";
import type { OffLooks } from "@pochical/prototype/components/shift-mark";
import {
  addDays,
  dateKey,
  initialDesignSchedule,
} from "@pochical/prototype/lib/design-days";
import type { DayEntry, Schedule } from "@pochical/prototype/lib/design-days";
import {
  mother,
  partner,
  sampleGroups,
  samplePhoto,
} from "@pochical/prototype/lib/design-group-samples";
import { presetPatterns } from "@pochical/prototype/lib/design-patterns";
import { designToday } from "@pochical/prototype/lib/design-today";
import {
  groupCompanion,
  widgetPersonOf,
} from "@pochical/prototype/lib/design-widget-companions";
import { widgetEntry } from "@pochical/prototype/lib/design-widgets";
import type {
  WidgetCompanion,
  WidgetEntry,
} from "@pochical/prototype/lib/design-widgets";
import { wallpaperSamples } from "@pochical/prototype/lib/material-you";
import { css } from "@pochical/styled-system/css";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";

import {
  parseWidgetVariants,
  widgetVariantKeys,
  widgetVariantOptions,
} from "../lib/design-widget-variants";
import type { WidgetVariants } from "../lib/design-widget-variants";
import { VariantPanel } from "./design-variant-panel";
import {
  NextOffCircular,
  TodayCircular,
  TodayInline,
  UpcomingRectangular,
} from "./design-widgets-lock";
import { NowCircular, NowRectangular, NowSmall } from "./design-widgets-now";

// The widgets of content/design/widgets at their real size, iPhone
// (390×844pt) and Pixel 9a, switched between the day they show, the device
// and the person's settings, as /demo switches the app. The switches are
// kept in the URL, and 種類 carries them to another kind's page. Each
// widget draws from one entry, worked out from the sample person, as the
// native widgets will from theirs.

// The sample month and the next, with today a work day of 残業 that has a
// memo, so every widget has something to show.
const OCTOBER = 9;
const sampleSchedule = {
  ...initialDesignSchedule(),
  ...initialDesignSchedule(4, OCTOBER),
  [dateKey(designToday)]: {
    end: "20:00",
    note: "新人さん同行。17時から棚卸しの打ち合わせ",
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

// Names under the marks, as when the person shows them in the calendar.
const namesShown = { names: { badge: true, emoji: true, icon: true } };

// Who the widgets can be set to: a partner off at weekends, a mother off
// on Tuesdays, Thursdays and weekends, someone who has entered nothing
// yet, and the sample person's groups: 家族 (those two), 看護学校の友達
// (two nurses on rotating shifts) and 高校の同級生 (nine, all kinds of
// work).
function groupOf(id: string) {
  const group = sampleGroups().find((one) => one.id === id);
  return group && groupCompanion(group);
}

function companionOf(
  choice: WidgetVariants["companion"]
): WidgetCompanion | undefined {
  switch (choice) {
    case "partner": {
      return { kind: "person", person: widgetPersonOf(partner) };
    }
    case "mother": {
      return { kind: "person", person: widgetPersonOf(mother) };
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
const yesterdayKey = dateKey(addDays(designToday, -1));
const afterTomorrowKey = dateKey(addDays(designToday, 2));
const plainDay: DayEntry = { shift: "day" };
function scheduleFor(day: WidgetVariants["day"]): Schedule {
  const days: Record<WidgetVariants["day"], Schedule> = {
    // A firefighter's 当番 from 8:30 to the next morning's, then 非番.
    afterDuty: {
      [yesterdayKey]: { shift: "duty" },
      [todayKey]: { shift: "offDuty" },
      [tomorrowKey]: { shift: "off" },
      [afterTomorrowKey]: { shift: "duty" },
    },
    blank: { [todayKey]: undefined },
    duty: {
      [todayKey]: { shift: "duty" },
      [tomorrowKey]: { shift: "offDuty" },
    },
    busy: {},
    early: { [todayKey]: { shift: "day", start: "07:00" } },
    earlyLate: { [todayKey]: { end: "20:00", shift: "day", start: "07:00" } },
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
const kinds = {
  calendar: [
    { View: TwoWeeksMedium, size: "medium" },
    { View: CalendarLarge, size: "large" },
  ],
  nextOff: [{ View: NextOffSmall, size: "small" }],
  now: [{ View: NowSmall, size: "small" }],
  simple: [
    { View: SimpleSmall, size: "small" },
    { View: SimpleMedium, size: "medium" },
  ],
  upcoming: [
    { View: UpcomingSmall, size: "small" },
    { View: UpcomingMedium, size: "medium" },
  ],
} satisfies Record<string, { size: Size; View: WidgetView }[]>;

export type WidgetKind = keyof typeof kinds;

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

// Every mark in the テーマ's one color, as シフトの色 ワントーン.
const monochromeOn = { monochrome: true };
const monochromeOff = { monochrome: false };
const namesHidden = { names: { badge: false, emoji: false, icon: false } };
// 休みの見せ方 as each choice names it.
const offLooks = {
  blank: { off: "blank", offs: noOffLooks },
  plain: { off: "mark", offs: noOffLooks },
  tint: { off: "highlight", offs: noOffLooks },
} satisfies Record<WidgetVariants["offLook"], OffLooks>;

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
                <OffLooksContext value={offLooks[variants.offLook]}>
                  {children}
                </OffLooksContext>
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

// The moment the widgets are looked at, on the day shown: 6:45 before a
// shift, as the lock screen is most looked at, unless 時刻 picks another.
function momentOf(day: Date, clock: WidgetVariants["clock"]) {
  const at = new Date(day);
  at.setHours(Number(clock.slice(1, 3)), Number(clock.slice(3)), 0, 0);
  return at;
}

// A phone's width, as the flows draw their screens, drawn smaller where
// the page is narrower, since the widgets keep their real sizes.
const PHONE_WIDTH = 390;
const lockPhone = css({ flexShrink: 0, width: `${PHONE_WIDTH}px` });

// The switches as the URL has them, and a change to one, kept there.
function useWidgetVariants() {
  const variants = parseWidgetVariants(useSearch({ strict: false }));
  const navigate = useNavigate();
  const change = (key: keyof WidgetVariants, value: string) => {
    void navigate({
      replace: true,
      resetScroll: false,
      search: (previous) => ({ ...previous, [key]: value }),
      to: ".",
    });
  };
  return [variants, change] as const;
}

// The pages under /design/widgets, a kind each, which 種類 moves between.
const widgetPages = [
  { label: "シンプル", slug: "simple" },
  { label: "次の休み", slug: "next-off" },
  { label: "これから", slug: "upcoming" },
  { label: "いまのシフト", slug: "now" },
  { label: "カレンダー", slug: "calendar" },
  { label: "ロック画面", slug: "lock" },
] as const;
export type WidgetPage = (typeof widgetPages)[number]["slug"];

const options = {
  kind: {
    choices: widgetPages.map(({ label, slug }) => ({ label, value: slug })),
    label: "種類",
  },
  ...widgetVariantOptions,
};
const order = ["kind", ...widgetVariantKeys];

// The switches, at the top of every widget's page: 種類 opens another
// kind's page with the same switches, the rest change this page's URL.
export function WidgetSwitches({ page }: { page: WidgetPage }) {
  const [variants, change] = useWidgetVariants();
  const navigate = useNavigate();
  return (
    <VariantPanel
      onChange={(key, value) => {
        if (key !== "kind") {
          change(key, value);
          return;
        }
        void navigate({
          params: { _splat: `design/widgets/${value}` },
          search: (previous) => previous,
          to: "/$",
        });
      }}
      options={options}
      order={order}
      title="切り替え"
      variants={{ ...variants, kind: page }}
    />
  );
}

// The one entry every widget draws from, at the moment the switches set.
function useEntry(variants: WidgetVariants) {
  const august = variants.month === "august";
  const at = momentOf(august ? augustDay : designToday, variants.clock);
  const entry = widgetEntry(
    august ? augustSchedule : scheduleFor(variants.day),
    weekOf(variants),
    at,
    presetPatterns,
    { companion: companionOf(variants.companion), me }
  );
  return { at, entry };
}

// One kind's sizes on the device's home screen, as the switches set it.
export function HomeWidgets({ kind }: { kind: WidgetKind }) {
  const [variants] = useWidgetVariants();
  const { entry } = useEntry(variants);
  const android = variants.platform === "android";
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
  return (
    <SettingsAround variants={variants}>
      <Wallpaper {...placement}>
        {kinds[kind].map(({ size, View }) => (
          <LabelledWidget {...placement} family={families[size]} key={size}>
            <View entry={entry} />
          </LabelledWidget>
        ))}
      </Wallpaper>
    </SettingsAround>
  );
}

// iPhone's lock screen with the widgets for it: the line above the clock,
// and the circles and rectangle under it, or いまのシフト's.
export function LockWidgets({ now = false }: { now?: boolean }) {
  const [variants] = useWidgetVariants();
  const { at, entry } = useEntry(variants);
  return (
    <SettingsAround variants={variants}>
      <Fit width={PHONE_WIDTH}>
        <div className={lockPhone}>
          {now ? (
            <LockScreen
              ground={wallpaperFor({ appearance: "lock" })}
              when={at}
              widgets={
                <>
                  <WidgetFrame appearance="lock" family="accessoryCircular">
                    <NowCircular entry={entry} />
                  </WidgetFrame>
                  <WidgetFrame appearance="lock" family="accessoryRectangular">
                    <NowRectangular entry={entry} />
                  </WidgetFrame>
                </>
              }
            />
          ) : (
            <LockScreen
              ground={wallpaperFor({ appearance: "lock" })}
              inline={
                <WidgetFrame appearance="lock" family="accessoryInline" inLine>
                  <TodayInline entry={entry} />
                </WidgetFrame>
              }
              when={at}
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
          )}
        </div>
      </Fit>
    </SettingsAround>
  );
}
