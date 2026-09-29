import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Account } from "../components/design-account";
import type { Appearance, PresetId } from "../components/design-theme";
import { defaultWeekSettings } from "../components/design-week";
import type { WeekSettings } from "../components/design-week";
import type { LookSettings, ShiftMarkStyle } from "../components/shift-mark";
import type { ColorScheme } from "./design-tokens";

// The person's settings on /design, sorted by where each would live in the
// app. The slices are the schema: what goes with the account and reaches
// the group, what the account alone keeps, and what stays on the device.
// Only the device slice is saved here, as the app would keep it locally.

// Seen by everyone in the person's groups: their marks' shape. Synced
// with the account. Colors are not: each viewer's テーマ draws them.
export type GroupLook = {
  style: ShiftMarkStyle;
  // Filled or outline; only icons have the choice.
  fill: boolean;
};

// How the person's own month draws days, kept per shape so each finds its
// switches as they were left. Device only.
export type CalendarOptions = {
  names: boolean;
  highlight: boolean;
  blankOff: boolean;
};

// How 画像で保存 draws the month. Names start on for the people it goes to,
// since they do not know the person's marks. `scheme` is the picture's own
// light or dark; until picked, it follows the screen. Device only.
export type ImageOptions = {
  names: boolean;
  highlight: boolean;
  // Days off left empty, as on the style page; off by default, since the
  // people it goes to cannot tell an empty day from one not entered.
  blankOff: boolean;
  scheme?: ColorScheme;
};

const defaultImageOptions: ImageOptions = {
  blankOff: false,
  highlight: true,
  names: true,
};

export type MonthName = "number" | "english";

// The rest of the person's own screen. Device only.
export type DeviceSettings = {
  preset: PresetId;
  // シフトを色分けする: each shift in its own color, or all of them in the
  // テーマ's.
  shiftColors: boolean;
  appearance: Appearance;
  week: WeekSettings;
  // 月の表示: the calendar's heading as 9月, or as sep.
  monthName: MonthName;
  appIcon: string;
  calendar: Record<ShiftMarkStyle, CalendarOptions>;
  // How 画像で保存 last drew the month.
  imageOptions: ImageOptions;
};

type SettingsState = {
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
  setAppIcon: (icon: string) => void;
  setImageOptions: (options: ImageOptions) => void;
  // Changes the options of the shape in use.
  setCalendarOptions: (change: Partial<CalendarOptions>) => void;
};

// Letters already sit on tinted tiles and are the shift's name, so they
// start without names and without the days-off highlight behind them.
const defaultCalendar: Record<ShiftMarkStyle, CalendarOptions> = {
  badge: { blankOff: false, highlight: false, names: false },
  emoji: { blankOff: false, highlight: true, names: false },
  icon: { blankOff: false, highlight: true, names: false },
};

// Where the device slice is saved, which /try's head also reads to color
// the status bar before the page draws.
export const deviceSettingsKey = "pochical-design-device";

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      device: {
        appIcon: "moss",
        appearance: "system",
        calendar: defaultCalendar,
        imageOptions: defaultImageOptions,
        monthName: "number",
        preset: "pochical",
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
      setCalendarOptions: (change) => {
        set((state) => {
          const { style } = state.groupLook;
          return {
            device: {
              ...state.device,
              calendar: {
                ...state.device.calendar,
                [style]: { ...state.device.calendar[style], ...change },
              },
            },
          };
        });
      },
      setImageOptions: (imageOptions) => {
        set((state) => ({ device: { ...state.device, imageOptions } }));
      },
      setMonthName: (monthName) => {
        set((state) => ({ device: { ...state.device, monthName } }));
      },
      setPreset: (preset) => {
        set((state) => ({ device: { ...state.device, preset } }));
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
      setWeek: (week) => {
        set((state) => ({ device: { ...state.device, week } }));
      },
    }),
    {
      // Settings added later keep their defaults when an older save loads.
      merge: (persisted, current) => ({
        ...current,
        device: {
          ...current.device,
          ...(persisted as { device?: Partial<DeviceSettings> } | undefined)
            ?.device,
        },
      }),
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
