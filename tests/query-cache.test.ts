import { expect, test } from "bun:test";
import { QueryCache } from "../src/lib/query-cache";

const storage = () => {
  const values = new Map<string, string>();
  return {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

test("cache restores data, preserves value types and replaces deleted results", () => {
  const disk = storage();
  const first = new QueryCache(disk, "alice");
  first.write("messages", [{ _id: "a", count: BigInt(1) }], "group");
  const restored = new QueryCache(disk, "alice");
  const value = restored.read("messages");
  expect(value).toEqual([{ _id: "a", count: BigInt(1) }]);
  expect(restored.read("messages")).toBe(value);
  restored.write("messages", [], "group");
  expect(restored.read("messages")).toEqual([]);
  restored.write("detail", null);
  expect(restored.read("detail")).toBeNull();
});

test("account switch clears persisted data and rejects late writes from old caches", () => {
  const disk = storage();
  const alice = new QueryCache(disk, "alice");
  alice.write("detail", { private: true });
  const bob = new QueryCache(disk, "bob");
  expect(bob.read("detail")).toBeUndefined();
  alice.write("late", "alice secret");
  expect(alice.read("detail")).toBeUndefined();
  const reboot = new QueryCache(disk, "bob");
  expect(reboot.read("late")).toBeUndefined();
  expect(new QueryCache(disk, "alice").read("detail")).toBeUndefined();
});

test("membership revocation removes group data and prevents stale repopulation", () => {
  const disk = storage();
  const cache = new QueryCache(disk, "alice");
  cache.write("a:messages", [1], "a");
  cache.write("b:messages", [2], "b");
  cache.reconcileGroups(["b"]);
  cache.write("a:messages", [3], "a");
  expect(cache.read("a:messages")).toBeUndefined();
  expect(cache.read("b:messages")).toEqual([2]);
  cache.removeGroup("b");
  cache.write("b:messages", [4], "b");
  expect(new QueryCache(disk, "alice").read("b:messages")).toBeUndefined();
});

test("invalid and expired cache data is discarded and storage stays bounded", () => {
  const disk = storage();
  disk.set("cache", "invalid json");
  const cache = new QueryCache(disk, "alice");
  for (let i = 0; i < 120; i += 1) {
    cache.write(`query:${i}`, i);
  }
  expect(cache.read("query:0")).toBeUndefined();
  expect(cache.read("query:119")).toBe(119);
  const saved = JSON.parse(disk.getString("cache") ?? "{}");
  for (const [, entry] of saved.entries) {
    entry.savedAt = 0;
  }
  disk.set("cache", JSON.stringify(saved));
  expect(new QueryCache(disk, "alice").read("query:119")).toBeUndefined();
});

test("removed members lose cached direct messages and shared schedules", () => {
  const cache = new QueryCache(storage(), "alice");
  cache.write("dm:bob", [1], "group", "bob");
  cache.write("group", [2], "group");
  cache.reconcileMembers("group", ["alice"]);
  cache.write("dm:bob", [3], "group", "bob");
  expect(cache.read("dm:bob")).toBeUndefined();
  expect(cache.read("group")).toEqual([2]);
});

test("oversized replacements drop stale data; unavailable persistence remains optional", () => {
  const cache = new QueryCache(storage(), "alice");
  cache.write("large", "old");
  cache.write("large", "x".repeat(600_000));
  expect(cache.read("large")).toBeUndefined();
  const unavailable = new QueryCache(
    {
      getString: () => {
        throw new Error("unavailable");
      },
      set: () => {
        throw new Error("full");
      },
    },
    "alice"
  );
  unavailable.write("live", [1]);
  expect(unavailable.read("live")).toEqual([1]);
});
