import { createContext, useCallback, useContext, useMemo } from "react";
import type { SetStateAction } from "react";
import { createStore, useStore } from "zustand";

import type {
  Chat,
  GroupSummary,
  Profile,
} from "../components/design-group-data";
import {
  sampleChats,
  sampleGroups,
  samplePhoto,
} from "../components/design-group-samples";
import {
  editedOwnDays,
  patternSets,
  plannedShifts,
  shownDays,
  workedOutThrough,
} from "./design-days";
import type { OwnDays, RepeatRule, Schedule } from "./design-days";
import { presetList } from "./design-patterns";
import type { Pattern } from "./design-patterns";
import { supportThreadOf } from "./design-support";
import type { SupportThread } from "./design-support";
import { designToday } from "./design-today";

// One person's data on /design, sorted by where it would live in the app.
// Unlike the settings, /design shows several people at once (01 and 02 are
// the same person; each 03 phone and onboarding are others), so each person
// gets a store of their own through UserStoreContext.

// Theirs, kept with the account in their User DO and synced to their
// devices. Groups see only what the User DO projects to them.
export type OwnData = {
  // The days they set themselves; the rest follow their repeating orders
  // (useShownDays).
  schedule: OwnDays;
  // Their shift patterns, in their order, which ポチポチ入力 follows.
  patterns: Pattern[];
  // Repeating orders, each taking over from the one before on its start.
  rules: RepeatRule[];
  profile: Profile;
  // 一緒に働く人: the people the person tags days with, in their order,
  // never sent to a group. Days name them by id (spec/sync-protocol.md,
  // Coworkers).
  coworkers: Coworker[];
  // Whether a line that mentions them notifies even in a chat turned off.
  // The server decides what to push, so it is the account's, not a phone's.
  mentionsWhenMuted: boolean;
  // Members they blocked, by account: across every group they share.
  blocked: string[];
  // Their chat with the people who make Pochical.
  support: SupportThread;
};

// Shared with the people in each group, kept by that group's Group DO.
export type GroupData = {
  // Each group as listed, with how the person appears in it.
  groups: GroupSummary[];
  // Chat threads by "groupId:threadId".
  chats: Record<string, Chat>;
};

type Setter<T> = (next: SetStateAction<T>) => void;

export type UserState = OwnData &
  GroupData & {
    setSchedule: Setter<OwnDays>;
    setPatterns: Setter<Pattern[]>;
    setRules: Setter<RepeatRule[]>;
    setProfile: Setter<Profile>;
    setCoworkers: Setter<Coworker[]>;
    setMentionsWhenMuted: Setter<boolean>;
    setBlocked: Setter<string[]>;
    setSupport: Setter<SupportThread>;
    setGroups: Setter<GroupSummary[]>;
    setChats: Setter<Record<string, Chat>>;
  };

// Someone in 一緒に働く人: a name, not an app user.
export type Coworker = { id: string; name: string };

export const sampleCoworkers: Coworker[] = [
  { id: "satou", name: "佐藤" },
  { id: "tanaka", name: "田中" },
  { id: "suzuki", name: "鈴木" },
  { id: "yamamoto", name: "山本" },
  { id: "takahashi", name: "高橋" },
];

const apply = <T>(next: SetStateAction<T>, previous: T): T =>
  typeof next === "function" ? (next as (value: T) => T)(previous) : next;

export function createUserStore(initial: Partial<OwnData & GroupData> = {}) {
  return createStore<UserState>()((set) => {
    // Accepts a value or an updater, like React's own setters.
    const setter =
      <K extends keyof (OwnData & GroupData)>(key: K) =>
      (next: SetStateAction<UserState[K]>) => {
        set((state) => ({ [key]: apply(next, state[key]) }));
      };
    return {
      blocked: [],
      chats: sampleChats,
      coworkers: sampleCoworkers,
      groups: sampleGroups(),
      mentionsWhenMuted: true,
      patterns: presetList(patternSets[4]),
      profile: { name: "さくら", photo: samplePhoto(1011) },
      rules: [],
      schedule: {},
      support: supportThreadOf("none"),
      ...initial,
      setBlocked: setter("blocked"),
      setChats: setter("chats"),
      setCoworkers: setter("coworkers"),
      setGroups: setter("groups"),
      setMentionsWhenMuted: setter("mentionsWhenMuted"),
      setPatterns: setter("patterns"),
      setProfile: setter("profile"),
      setRules: setter("rules"),
      setSchedule: setter("schedule"),
      setSupport: setter("support"),
    };
  });
}

export type UserStore = ReturnType<typeof createUserStore>;

export const UserStoreContext = createContext<UserStore | undefined>(undefined);

// Reads the person in view: the nearest UserStoreContext.
export function useUser<T>(selector: (state: UserState) => T): T {
  const store = useContext(UserStoreContext);
  if (!store) {
    throw new Error("useUser needs a UserStoreContext around it");
  }
  return useStore(store, selector);
}

const plannedOf = (rules: RepeatRule[], patterns: Pattern[], inView?: Date) =>
  plannedShifts(
    rules,
    new Set(patterns.map(({ id }) => id)),
    workedOutThrough(rules, designToday, inView)
  );

// The person's days as they show: each day's own shift, else its repeating
// order's (spec/shift-patterns.md, Repeating orders), worked out at least
// through the month `inView`.
export function useShownDays(inView?: Date): Schedule {
  const own = useUser((state) => state.schedule);
  const rules = useUser((state) => state.rules);
  const patterns = useUser((state) => state.patterns);
  return useMemo(
    () => shownDays(own, plannedOf(rules, patterns, inView)),
    [own, rules, patterns, inView]
  );
}

// Changes the days as they show, like a setter of useShownDays: only what
// differs from the orders is kept as the person's own. `inView` is the
// month the days were shown through, as useShownDays had it.
export function useChangeDays(inView?: Date) {
  const store = useContext(UserStoreContext);
  if (!store) {
    throw new Error("useChangeDays needs a UserStoreContext around it");
  }
  return useCallback(
    (next: SetStateAction<Schedule>) => {
      const { patterns, rules, schedule, setSchedule } = store.getState();
      const planned = plannedOf(rules, patterns, inView);
      const shown = shownDays(schedule, planned);
      setSchedule(editedOwnDays(schedule, planned, shown, apply(next, shown)));
    },
    [store, inView]
  );
}
