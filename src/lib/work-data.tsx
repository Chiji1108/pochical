import { useAuthToken } from "@convex-dev/auth/react";
import { useConvex } from "convex/react";
import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";
import { api } from "../../convex/_generated/api";
import { createAccountStorage } from "./account-storage";
import { hydrateWorkData, type WorkData } from "./work-model";
import {
  isWorkAccessRevoked,
  subscribeWorkSnapshots,
} from "./work-subscriptions";
import { type WorkChange, WorkSync } from "./work-sync";

export type {
  Member,
  Pattern,
  Shift,
  ShiftMember,
  WorkData,
} from "./work-model";
export type { WorkChange } from "./work-sync";

const Context = createContext<WorkSync | null>(null);
let activeStore: WorkSync | null = null;
let activeSubscriptionCleanup: (() => void) | undefined;
export const stopWorkSync = () => {
  activeSubscriptionCleanup?.();
  activeStore?.close();
  activeStore = null;
};
export const writeWork = (
  changes: WorkChange | WorkChange[]
): Promise<void> => {
  try {
    if (!activeStore) {
      throw new Error("Work store is not ready");
    }
    activeStore.change(Array.isArray(changes) ? changes : [changes]);
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
};
export const WorkDataProvider = ({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) => {
  const client = useConvex();
  const token = useAuthToken();
  const [syncError, setSyncError] = useState<Error>();
  const store = useMemo(() => {
    const storage = createAccountStorage("work", userId);
    return new WorkSync(
      userId,
      storage.getString("state"),
      (value) => storage.set("state", value),
      (table, document, bytes) =>
        client.mutation(api[table].replicate, { document, bytes })
    );
  }, [client, userId]);
  useEffect(() => {
    store.resume();
    activeStore = store;
    return () => {
      store.close();
      if (activeStore === store) {
        activeStore = null;
      }
    };
  }, [store]);
  useEffect(() => {
    if (!token) {
      return;
    }
    const stopSnapshots = subscribeWorkSnapshots(
      store,
      (table) => client.watchQuery(api[table].snapshot, {}),
      (error) => {
        if (!isWorkAccessRevoked(error)) {
          setSyncError(
            error instanceof Error
              ? error
              : new Error("同期データを取得できませんでした")
          );
        }
      }
    );
    store.flush().catch(() => undefined);
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        store.flush().catch(() => undefined);
      }
    });
    const retry = setInterval(() => {
      store.flush().catch(() => undefined);
    }, 15_000);
    const cleanup = () => {
      stopSnapshots();
      foreground.remove();
      clearInterval(retry);
      if (activeSubscriptionCleanup === cleanup) {
        activeSubscriptionCleanup = undefined;
      }
    };
    activeSubscriptionCleanup = cleanup;
    return cleanup;
  }, [client, store, token]);
  if (syncError) {
    throw syncError;
  }
  return <Context value={store}>{children}</Context>;
};
export const useCurrentUserId = () => use(Context)?.ownerId;
const EMPTY: WorkData = { patterns: [], members: [], shifts: [] };
export type WorkDataDateRange = { start: Date; end: Date };
export const useOwnWorkData = (
  userId?: string,
  range?: WorkDataDateRange
): WorkData => {
  const store = use(Context);
  if (!store) {
    throw new Error("Missing work data provider");
  }
  const records = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );
  const start = range?.start.getTime();
  const end = range?.end.getTime();
  return useMemo(
    () =>
      userId === store.ownerId
        ? hydrateWorkData(
            records.shiftPatterns,
            records.shiftMembers,
            records.shifts.filter(
              (shift) =>
                (start === undefined || shift.startDate >= start) &&
                (end === undefined || shift.startDate <= end)
            )
          )
        : EMPTY,
    [userId, store.ownerId, records, start, end]
  );
};
export const usePatternById = (patternId?: string, userId?: string) =>
  useOwnWorkData(userId).patterns.find((pattern) => pattern.id === patternId);
