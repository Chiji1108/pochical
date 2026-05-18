import { getItemAsync, setItemAsync } from "expo-secure-store";
import {
  createContext,
  type FC,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

const APP_SETTINGS_STORAGE_KEY = "nurse-shift-app-settings";

export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type CalendarHighlightTarget = "holiday" | "saturday" | "sunday";

export type AppSettings = {
  calendarHighlightTargets: CalendarHighlightTarget[];
  weekStartsOn: WeekStartsOn;
};

type AppSettingsContextValue = {
  settings: AppSettings;
  setCalendarHighlightTargets: (
    targets: CalendarHighlightTarget[]
  ) => Promise<void>;
  setWeekStartsOn: (weekStartsOn: WeekStartsOn) => Promise<void>;
};

type AppSettingsProviderProps = {
  children: ReactNode;
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  calendarHighlightTargets: ["holiday"],
  weekStartsOn: 0,
};

const CALENDAR_HIGHLIGHT_TARGETS = new Set<CalendarHighlightTarget>([
  "holiday",
  "saturday",
  "sunday",
]);

const AppSettingsContext = createContext<AppSettingsContextValue | undefined>(
  undefined
);

const isWeekStartsOn = (value: unknown): value is WeekStartsOn =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 6;

const isCalendarHighlightTarget = (
  value: unknown
): value is CalendarHighlightTarget =>
  typeof value === "string" &&
  CALENDAR_HIGHLIGHT_TARGETS.has(value as CalendarHighlightTarget);

const normalizeSettings = (value: unknown): AppSettings => {
  if (!value || typeof value !== "object") {
    return DEFAULT_APP_SETTINGS;
  }

  const settings = value as Partial<AppSettings>;
  const calendarHighlightTargets = Array.isArray(
    settings.calendarHighlightTargets
  )
    ? settings.calendarHighlightTargets.filter(isCalendarHighlightTarget)
    : DEFAULT_APP_SETTINGS.calendarHighlightTargets;

  return {
    calendarHighlightTargets,
    weekStartsOn: isWeekStartsOn(settings.weekStartsOn)
      ? settings.weekStartsOn
      : DEFAULT_APP_SETTINGS.weekStartsOn,
  };
};

const loadSettings = async (): Promise<AppSettings> => {
  try {
    const settingsJson = await getItemAsync(APP_SETTINGS_STORAGE_KEY);

    if (!settingsJson) {
      return DEFAULT_APP_SETTINGS;
    }

    return normalizeSettings(JSON.parse(settingsJson));
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
};

const persistSettings = async (settings: AppSettings): Promise<void> => {
  await setItemAsync(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

export const AppSettingsProvider: FC<AppSettingsProviderProps> = ({
  children,
}) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);

  useEffect(() => {
    let isMounted = true;

    loadSettings().then((loadedSettings) => {
      if (isMounted) {
        setSettings(loadedSettings);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateSettings = useCallback(
    async (getNextSettings: (current: AppSettings) => AppSettings) => {
      const nextSettings = getNextSettings(settings);
      setSettings(nextSettings);

      try {
        await persistSettings(nextSettings);
      } catch {
        setSettings(settings);
      }
    },
    [settings]
  );

  const setWeekStartsOn = useCallback(
    async (weekStartsOn: WeekStartsOn) => {
      await updateSettings((currentSettings) => ({
        ...currentSettings,
        weekStartsOn,
      }));
    },
    [updateSettings]
  );

  const setCalendarHighlightTargets = useCallback(
    async (targets: CalendarHighlightTarget[]) => {
      await updateSettings((currentSettings) => ({
        ...currentSettings,
        calendarHighlightTargets: targets.filter(isCalendarHighlightTarget),
      }));
    },
    [updateSettings]
  );

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      settings,
      setCalendarHighlightTargets,
      setWeekStartsOn,
    }),
    [settings, setCalendarHighlightTargets, setWeekStartsOn]
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = (): AppSettingsContextValue => {
  const context = use(AppSettingsContext);

  if (!context) {
    throw new Error("useAppSettings must be used within AppSettingsProvider");
  }

  return context;
};
