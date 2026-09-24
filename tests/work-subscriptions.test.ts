import { expect, mock, test } from "bun:test";
import { ConvexError } from "convex/values";
import {
  isWorkAccessRevoked,
  subscribeWorkSnapshots,
} from "../src/lib/work-subscriptions";

test("revoked snapshots stop every watcher without throwing from the notification callback", () => {
  const callbacks: (() => void)[] = [];
  let failure: Error | undefined;
  const read = mock(() => {
    if (failure) {
      throw failure;
    }
    return [];
  });
  const unsubscribe = mock(() => undefined);
  const store = {
    close: mock(() => undefined),
    receive: mock(() => undefined),
  };
  const onError = mock((error: unknown) =>
    expect(isWorkAccessRevoked(error)).toBe(true)
  );
  const stop = subscribeWorkSnapshots(
    store,
    () => ({
      localQueryResult: read,
      onUpdate: (callback) => {
        callbacks.push(callback);
        return unsubscribe;
      },
    }),
    onError
  );
  callbacks[0]();
  expect(store.receive).toHaveBeenCalledTimes(1);
  failure = new ConvexError("Authentication required");
  expect(() => callbacks[1]()).not.toThrow();
  expect(unsubscribe).toHaveBeenCalledTimes(3);
  expect(store.close).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledTimes(1);
  const reads = read.mock.calls.length;
  for (const callback of callbacks) {
    callback();
  }
  stop();
  expect(read).toHaveBeenCalledTimes(reads);
  expect(store.receive).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(3);
});

test("explicit cleanup ignores queued callbacks, while unexpected errors are reported", () => {
  let update = () => undefined;
  const read = mock(() => {
    throw new Error("Unexpected server failure");
  });
  const store = {
    close: mock(() => undefined),
    receive: mock(() => undefined),
  };
  const onError = mock(() => undefined);
  const watch = () => ({
    localQueryResult: read,
    onUpdate: (callback: () => void) => {
      update = callback;
      return () => undefined;
    },
  });
  const stop = subscribeWorkSnapshots(store, watch, onError);
  stop();
  update();
  expect(read).not.toHaveBeenCalled();
  subscribeWorkSnapshots(store, watch, onError);
  expect(() => update()).not.toThrow();
  expect(onError).toHaveBeenCalledWith(new Error("Unexpected server failure"));
  expect(isWorkAccessRevoked(new Error("Authentication required"))).toBe(false);
});
