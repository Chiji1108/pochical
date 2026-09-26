import { ConvexError } from "convex/values";
import { WORK_TABLES, type WorkSync, type WorkTable } from "./work-sync";

type Snapshot = { id: string; bytes: ArrayBuffer | null }[];
type SnapshotWatch = {
  localQueryResult: () => Snapshot | undefined;
  onUpdate: (callback: () => void) => () => void;
};

export const isWorkAccessRevoked = (error: unknown) =>
  error instanceof ConvexError && error.data === "Authentication required";

export const subscribeWorkSnapshots = (
  store: Pick<WorkSync, "receive" | "close">,
  watch: (table: WorkTable) => SnapshotWatch,
  onError: (error: unknown) => void
) => {
  let stopped = false;
  const subscriptions: (() => void)[] = [];
  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
  };
  for (const table of WORK_TABLES) {
    if (stopped) {
      break;
    }
    const query = watch(table);
    const unsubscribe = query.onUpdate(() => {
      if (stopped) {
        return;
      }
      try {
        const rows = query.localQueryResult();
        if (rows) {
          store.receive(table, rows);
        }
      } catch (error) {
        // Revocation may arrive before AuthGate has unmounted this provider.
        stop();
        store.close();
        onError(error);
      }
    });
    if (stopped) {
      unsubscribe();
    } else {
      subscriptions.push(unsubscribe);
    }
  }
  return stop;
};
