import type { ColorScheme } from "@pochical/design/colors";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Account } from "../components/design-account";
import type { Appearance, PresetId } from "../components/design-theme";
import { defaultWeekSettings } from "../components/design-week";
import type { WeekSettings } from "../components/design-week";
import type {
  GroupLook,
  LookSettings,
  OffLookId,
  ShiftMarkStyle,
} from "../components/shift-mark";
import { defaultReminders } from "./design-reminders";
import type { Reminder } from "./design-reminders";
import { deviceSettingsKey } from "./design-settings-key";

// The person's settings on /design, sorted by where each would live in the
// app. The slices are the schema: what goes with the account and reaches
// the group, what the account alone keeps, and what stays on the device.
// Only the device slice is saved here, as the app would keep it locally.

// How the person's own month draws days, kept per shape so each finds its
// switches as they were left: `off` is how days off show, and `offs` each
// pattern's own 休みの見せ方 over it, by its id, once set. Device only.
export type CalendarOptions = {
  names: boolean;
  off: OffLookId;
  offs?: Partial<Record<string, OffLookId>>;
};

// How 画像で保存 draws the month. Names start on for the people it goes to,
// since they do not know the person's marks. `scheme` is the picture's own
// light or dark; until picked, it follows the screen. Device only.
export type ImageOptions = {
  names: boolean;
  // How days off show, as on the style page; never blank at first, since
  // the people it goes to cannot tell an empty day from one not entered.
  off: OffLookId;
  scheme?: ColorScheme;
};

const defaultImageOptions: ImageOptions = {
  names: true,
  off: "highlight",
};

export type MonthName = "number" | "english";

// What a tap on the calendar's month name does: open the month sheet, or
// おたのしみ, which lights a sky at the calendar's top and changes its
// colors on each tap.
export type MonthTap = "pick" | "surprise";

// 端末カレンダーに追加's メモも入れる and 一緒に働く人も入れる.
export type CalendarAdd = {
  // The patterns counted as off whose days go in too, sorted.
  off: string[];
  notes: boolean;
  people: boolean;
};

// The rest of the person's own screen. Device only.
export type DeviceSettings = {
  preset: PresetId;
  // シフトの色: each shift in its own color (色分け), or all of them in the
  // テーマ's.
  shiftColors: boolean;
  appearance: Appearance;
  week: WeekSettings;
  // 月と曜日: the calendar's headings as 9月 and 日, or as sep. and S.
  monthName: MonthName;
  monthTap: MonthTap;
  // Which of おたのしみ's skies is up, kept until the next tap; none until
  // the month name is first tapped, so nothing gives it away, and then
  // the テーマ's own.
  sky?: string;
  appIcon: string;
  calendar: Record<ShiftMarkStyle, CalendarOptions>;
  // How 画像で保存 last drew the month.
  imageOptions: ImageOptions;
  // What 端末カレンダーに追加 puts in besides the shifts, as last left:
  // each off at first, as a calendar may be shared with family.
  calendarAdd: CalendarAdd;
  // Reminders of the person's shifts, sent by this device on its own.
  reminders: Reminder[];
};

type SettingsState = {
  // Seen by everyone in the person's groups; synced with the account.
  groupLook: GroupLook;
  // Signed in with Apple or Google, if at all.
  account?: Account;
  device: DeviceSettings;
  setShape: (shape: { style: ShiftMarkStyle; fill?: boolean }) => void;
  setAccount: (account: Account | undefined) => void;
  setPreset: (preset: PresetId) => void;
  setShiftColors: (shiftColors: boolean) => void;
  setAppearance: (appearance: Appearance) => void;
  setWeek: (week: WeekSettings) => void;
  setMonthName: (monthName: MonthName) => void;
  setMonthTap: (monthTap: MonthTap) => void;
  setSky: (sky: string) => void;
  setAppIcon: (icon: string) => void;
  setImageOptions: (options: ImageOptions) => void;
  setCalendarAdd: (calendarAdd: CalendarAdd) => void;
  setReminders: (reminders: Reminder[]) => void;
  // Changes the options of the shape in use.
  setCalendarOptions: (change: Partial<CalendarOptions>) => void;
  // Sets how one pattern's days off show in the shape in use, and drops
  // from every shape the patterns no longer among `offPatterns`, so the
  // look, kept with the account, does not grow with each pattern ever
  // deleted.
  setOffLook: (
    shift: string,
    look: OffLookId,
    offPatterns: readonly string[]
  ) => void;
};

// Letters already sit on tinted tiles and are the shift's name, so they
// start without names and without the days-off highlight behind them.
// Emoji bring their own colors, which a tint behind them fights with, so
// they start without the highlight too.
const defaultCalendar: Record<ShiftMarkStyle, CalendarOptions> = {
  badge: { names: false, off: "mark" },
  emoji: { names: false, off: "mark" },
  icon: { names: false, off: "highlight" },
};

// The calendar with the options of `style` changed, the other shapes' as
// they were.
function withOptions(
  calendar: Record<ShiftMarkStyle, CalendarOptions>,
  style: ShiftMarkStyle,
  change: Partial<CalendarOptions>
): Record<ShiftMarkStyle, CalendarOptions> {
  return { ...calendar, [style]: { ...calendar[style], ...change } };
}

// The device settings a save holds, whatever was saved: what is not an
// object is none.
function savedDevice(persisted: unknown) {
  if (
    typeof persisted === "object" &&
    persisted !== null &&
    "device" in persisted &&
    typeof persisted.device === "object" &&
    persisted.device !== null
  ) {
    return persisted.device;
  }
  return {};
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      device: {
        appIcon: "moss",
        appearance: "system",
        calendar: defaultCalendar,
        calendarAdd: { notes: false, off: [], people: false },
        imageOptions: defaultImageOptions,
        monthName: "number",
        monthTap: "pick",
        preset: "pochical",
        reminders: defaultReminders,
        shiftColors: true,
        week: defaultWeekSettings,
      },
      groupLook: { fill: true, style: "icon" },
      setAccount: (account) => {
        set({ account });
      },
      setAppIcon: (appIcon) => {
        set((state) => ({ device: { ...state.device, appIcon } }));
      },
      setAppearance: (appearance) => {
        set((state) => ({ device: { ...state.device, appearance } }));
      },
      setCalendarAdd: (calendarAdd) => {
        set((state) => ({ device: { ...state.device, calendarAdd } }));
      },
      setCalendarOptions: (change) => {
        set((state) => ({
          device: {
            ...state.device,
            calendar: withOptions(
              state.device.calendar,
              state.groupLook.style,
              change
            ),
          },
        }));
      },
      setImageOptions: (imageOptions) => {
        set((state) => ({ device: { ...state.device, imageOptions } }));
      },
      setMonthName: (monthName) => {
        set((state) => ({ device: { ...state.device, monthName } }));
      },
      setMonthTap: (monthTap) => {
        set((state) => ({ device: { ...state.device, monthTap } }));
      },
      setOffLook: (shift, look, offPatterns) => {
        set((state) => {
          const { style } = state.groupLook;
          const kept = (options: CalendarOptions) =>
            Object.fromEntries(
              Object.entries(options.offs ?? {}).filter(([key]) =>
                offPatterns.includes(key)
              )
            );
          const { badge, emoji, icon } = state.device.calendar;
          const pruned = {
            badge: { ...badge, offs: kept(badge) },
            emoji: { ...emoji, offs: kept(emoji) },
            icon: { ...icon, offs: kept(icon) },
          };
          const calendar = withOptions(pruned, style, {
            offs: { ...pruned[style].offs, [shift]: look },
          });
          return { device: { ...state.device, calendar } };
        });
      },
      setPreset: (preset) => {
        set((state) => ({ device: { ...state.device, preset } }));
      },
      setReminders: (reminders) => {
        set((state) => ({ device: { ...state.device, reminders } }));
      },
      setShape: ({ style, fill }) => {
        set((state) => ({
          groupLook: {
            ...state.groupLook,
            fill: fill ?? state.groupLook.fill,
            style,
          },
        }));
      },
      setShiftColors: (shiftColors) => {
        set((state) => ({ device: { ...state.device, shiftColors } }));
      },
      setSky: (sky) => {
        set((state) => ({ device: { ...state.device, sky } }));
      },
      setWeek: (week) => {
        set((state) => ({ device: { ...state.device, week } }));
      },
    }),
    {
      // Settings added later keep their defaults when an older save loads.
      merge: (persisted, current) => {
        const device = { ...current.device, ...savedDevice(persisted) };
        // What 端末カレンダーに追加 puts in, filled to its newest shape.
        const calendarAdd = {
          ...current.device.calendarAdd,
          ...device.calendarAdd,
        };
        return { ...current, device: { ...device, calendarAdd } };
      },
      name: deviceSettingsKey,
      partialize: (state) => ({ device: state.device }),
      // The page renders on the server first; the saved settings load after
      // it hydrates, so both renders start from the defaults.
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// The shape in use with its own-screen options, as the marks read them.
export function useLook(): LookSettings {
  const groupLook = useSettings((state) => state.groupLook);
  const options = useSettings(
    (state) => state.device.calendar[state.groupLook.style]
  );
  return {
    ...options,
    fill: groupLook.fill,
    style: groupLook.style,
  };
}
