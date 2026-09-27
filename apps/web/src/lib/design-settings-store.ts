import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Account } from "../components/design-account";
import type { Appearance, ColorChoice } from "../components/design-theme";
import { defaultWeekSettings } from "../components/design-week";
import type { WeekSettings } from "../components/design-week";
import type { LookSettings, ShiftMarkStyle } from "../components/shift-mark";
import type { Tone } from "./design-tokens";

// The person's settings on /design, sorted by where each would live in the
// app. The slices are the schema: what goes with the account and reaches
// the group, what the account alone keeps, and what stays on the device.
// Only the device slice is saved here, as the app would keep it locally.

// Seen by everyone in the person's groups: their marks' shape and color.
// Synced with the account.
export type GroupLook = {
  style: ShiftMarkStyle;
  // Filled or outline; only icons have the choice.
  fill: boolean;
  color: ColorChoice;
};

// How the person's own month draws days, kept per shape so each finds its
// switches as they were left. Device only.
export type CalendarOptions = {
  names: boolean;
  highlight: boolean;
  blankOff: boolean;
};

// The rest of the person's own screen. Device only.
export type DeviceSettings = {
  tone: Tone;
  appearance: Appearance;
  week: WeekSettings;
  appIcon: string;
  calendar: Record<ShiftMarkStyle, CalendarOptions>;
};

type SettingsState = {
  groupLook: GroupLook;
  // Signed in with Apple or Google, if at all.
  account?: Account;
  device: DeviceSettings;
  setShape: (shape: { style: ShiftMarkStyle; fill?: boolean }) => void;
  setColor: (color: ColorChoice) => void;
  setAccount: (account: Account | undefined) => void;
  setTone: (tone: Tone) => void;
  setAppearance: (appearance: Appearance) => void;
  setWeek: (week: WeekSettings) => void;
  setAppIcon: (icon: string) => void;
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

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      device: {
        appIcon: "moss",
        appearance: "system",
        calendar: defaultCalendar,
        tone: "deep",
        week: defaultWeekSettings,
      },
      groupLook: { color: "multi", fill: true, style: "icon" },
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
      setColor: (color) => {
        set((state) => ({ groupLook: { ...state.groupLook, color } }));
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
      setTone: (tone) => {
        set((state) => ({ device: { ...state.device, tone } }));
      },
      setWeek: (week) => {
        set((state) => ({ device: { ...state.device, week } }));
      },
    }),
    {
      name: "pochical-design-device",
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
