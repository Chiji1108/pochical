import { createContext, useContext } from "react";
import type { SetStateAction } from "react";
import { createStore, useStore } from "zustand";

import { patternSets } from "../components/design-calendar";
import type {
  RepeatRule,
  Schedule,
  Shift,
} from "../components/design-calendar";
import {
  sampleChats,
  sampleGroups,
  samplePhoto,
} from "../components/design-group";
import type { Chat, GroupSummary, Profile } from "../components/design-group";

// One person's data on /design, sorted by where it would live in the app.
// Unlike the settings, /design shows several people at once (01 and 02 are
// the same person; each 03 phone and onboarding are others), so each person
// gets a store of their own through UserStoreContext.

// Theirs, kept with the account in their User DO and synced to their
// devices. Groups see only what the User DO projects to them.
export type OwnData = {
  schedule: Schedule;
  patternKeys: Shift[];
  // Repeating orders, each taking over from the one before on its start.
  rules: RepeatRule[];
  profile: Profile;
  // 一緒に働く人: names the person tags days with, never sent to a group.
  coworkers: string[];
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
    setSchedule: Setter<Schedule>;
    setPatternKeys: Setter<Shift[]>;
    setRules: Setter<RepeatRule[]>;
    setProfile: Setter<Profile>;
    setCoworkers: Setter<string[]>;
    setGroups: Setter<GroupSummary[]>;
    setChats: Setter<Record<string, Chat>>;
  };

export const sampleCoworkers = ["佐藤", "田中", "鈴木", "山本", "高橋"];

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
      chats: sampleChats,
      coworkers: sampleCoworkers,
      groups: sampleGroups(),
      patternKeys: patternSets[4],
      profile: { name: "さくら", photo: samplePhoto(1011) },
      rules: [],
      schedule: {},
      ...initial,
      setChats: setter("chats"),
      setCoworkers: setter("coworkers"),
      setGroups: setter("groups"),
      setPatternKeys: setter("patternKeys"),
      setProfile: setter("profile"),
      setRules: setter("rules"),
      setSchedule: setter("schedule"),
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
