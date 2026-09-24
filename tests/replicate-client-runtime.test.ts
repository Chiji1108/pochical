import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { collection, persistence } from "@trestleinc/replicate/client";
import { schema } from "@trestleinc/replicate/server";
import type { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

const definition = schema.define({
  version: 1,
  shape: v.object({ id: v.string(), ownerId: v.string(), notes: v.string() }),
});
type RecordData = { id: string; ownerId: string; notes: string };
const api = {
  material: makeFunctionReference<"query">("runtimeProbe:material"),
  delta: makeFunctionReference<"query">("runtimeProbe:delta"),
  replicate: makeFunctionReference<"mutation">("runtimeProbe:replicate"),
  presence: makeFunctionReference<"mutation">("runtimeProbe:presence"),
  session: makeFunctionReference<"query">("runtimeProbe:session"),
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
const openPersistence = (db: Database) =>
  persistence.native.sqlite.create(
    {
      execute: (sql, params = []) =>
        Promise.resolve({ rows: db.query(sql).all(...params) }),
      close: () => {
        /* Database lifetime belongs to the test. */
      },
    },
    "probe"
  );
const createProbe = async (db: Database, transport: object) => {
  const lazy = collection.create<RecordData>({
    schema: definition,
    persistence: () => openPersistence(db),
    config: () => ({
      // In-process transport only; the actual Replicate client and SQLite adapter run unchanged.
      convexClient: transport as ConvexClient,
      api,
      getKey: (doc) => doc.id,
    }),
  });
  await lazy.init();
  const client = lazy.get();
  return client;
};

test("runtime probe: SQLite retains an offline insert across client recreation", async () => {
  const db = new Database(":memory:");
  let writes = 0;
  const transport = {
    query: () => Promise.resolve({ mode: "recovery", diff: null }),
    mutation: () => {
      writes += 1;
      return new Promise(() => {
        /* Simulate an unacknowledged offline mutation. */
      });
    },
    onUpdate: () => () => {
      /* No remote changes during this probe. */
    },
  };
  const first = await createProbe(db, transport);
  await first.preload();
  first.insert({ id: "offline", ownerId: "alice", notes: "unsent" });
  await pause();
  expect(writes).toBe(1);
  await first.cleanup();
  const second = await createProbe(db, transport);
  await second.preload();
  expect(second.get("offline")?.notes).toBe("unsent");
  await pause();
  // Probe the library's behavior, not the desired application requirement:
  // recreation restores local data but does not re-enqueue the pending insert.
  expect(writes).toBe(1);
  await second.cleanup();
  db.close();
});

test("runtime probe: restoring local rows waits for network recovery", async () => {
  const db = new Database(":memory:");
  const transport = {
    query: () => Promise.resolve({ mode: "recovery", diff: null }),
    mutation: () => Promise.resolve({ success: true, seq: 1 }),
    onUpdate: () => () => {
      /* No remote changes during this probe. */
    },
  };
  const first = await createProbe(db, transport);
  await first.preload();
  await first.insert({ id: "saved", ownerId: "alice", notes: "local" })
    .isPersisted.promise;
  await pause();
  await first.cleanup();
  let release: (() => void) | undefined;
  const blocked = new Promise<{ mode: string; diff: null }>((resolve) => {
    release = () => resolve({ mode: "recovery", diff: null });
  });
  const second = await createProbe(db, { ...transport, query: () => blocked });
  let ready = false;
  const loading = second.preload().then(() => {
    ready = true;
  });
  await pause();
  expect(ready).toBe(false);
  expect(second.get("saved")).toBeUndefined();
  release?.();
  await loading;
  await pause();
  expect(second.get("saved")?.notes).toBe("local");
  await second.cleanup();
  db.close();
});
