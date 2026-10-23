import { createContext, useContext } from "react";

// What a phone offers besides its calendar, where the shifts are picked
// and entered: the group and settings tabs, saving a month, and the
// reminders that ask the system to notify. The top page offers the
// calendar alone; /try and /demo every one.
const appFeatures = ["group", "settings", "save", "notifications"] as const;

export type AppFeature = (typeof appFeatures)[number];
export type AppFeatures = ReadonlySet<AppFeature>;

export const everyFeature: AppFeatures = new Set(appFeatures);
export const calendarAlone: AppFeatures = new Set();

export const AppFeaturesContext = createContext<AppFeatures>(everyFeature);

export const useAppFeatures = (): AppFeatures => useContext(AppFeaturesContext);
