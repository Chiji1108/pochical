import { expect, test } from "bun:test";
import { collection, persistence } from "@trestleinc/replicate/client";
import { schema as replicateSchema } from "@trestleinc/replicate/server";
import type { ConvexClient } from "convex/browser";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { Doc, encodeStateAsUpdateV2, encodeStateVector } from "yjs";
import componentSchema from "../../../node_modules/@trestleinc/replicate/dist/component/schema.js";
import schema from "../convex/schema";
import { shiftShape } from "../shared/work-schema";

const api = {
  delta: makeFunctionReference<"query">("scopedProbe:delta"),
  material: makeFunctionReference<"query">("scopedProbe:material"),
  replicate: makeFunctionReference<"mutation">("scopedProbe:replicate"),
  presence: makeFunctionReference<"mutation">("scopedProbe:presence"),
  session: makeFunctionReference<"query">("scopedProbe:session"),
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

test("standard client can read, write and delete through a scoped protocol adapter", async () => {
  const t = convexTest(schema, {
    "./_generated/api.ts": () => import("../convex/_generated/api"),
    "./shifts.ts": () => import("../convex/shifts"),
    "./scopedProbe.ts": () => import("./fixtures/replicate-scoped-probe"),
  });
  t.registerComponent("replicate", componentSchema, {
    "./_generated/api.js": () =>
      import(
        "../../../node_modules/@trestleinc/replicate/dist/component/_generated/api.js"
      ),
    "./mutations.js": () =>
      import(
        "../../../node_modules/@trestleinc/replicate/dist/component/mutations.js"
      ),
  });
  const [aliceId, bobId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { isAnonymous: true }),
    await ctx.db.insert("users", { isAnonymous: true }),
  ]);
  const alice = t.withIdentity({ subject: `${aliceId}|session` });
  const bob = t.withIdentity({ subject: `${bobId}|session` });
  const subscriptions = new Set<() => Promise<void>>();
  const transport = {
    query: (ref: typeof api.delta, args: object) => alice.query(ref, args),
    mutation: async (ref: typeof api.replicate, args: object) => {
      if (getFunctionName(ref).endsWith(":presence")) {
        return null; // Presence is outside this calendar data protocol probe.
      }
      const result = await alice.mutation(ref, args);
      for (const refresh of subscriptions) {
        await refresh();
      }
      return result;
    },
    onUpdate: (
      ref: typeof api.delta,
      args: object,
      callback: (value: unknown) => void
    ) => {
      const refresh = async () => callback(await alice.query(ref, args));
      subscriptions.add(refresh);
      return () => subscriptions.delete(refresh);
    },
  };
  const lazy = collection.create({
    schema: replicateSchema.define({ version: 1, shape: shiftShape }),
    persistence: () => Promise.resolve(persistence.memory.create()),
    config: () => ({
      convexClient: transport as unknown as ConvexClient,
      api,
      getKey: (row: { id: string }) => row.id,
    }),
  });
  await lazy.init();
  const client = lazy.get();
  await client.preload();
  await tick();
  const record = {
    id: "scoped-shift",
    ownerId: aliceId,
    startDate: 123,
    notes: "private",
    patternId: null,
    memberIds: [],
  };
  await client.insert(record).isPersisted.promise;
  await tick();
  expect(client.get(record.id)?.notes).toBe("private");
  expect((await alice.query(api.delta, { seq: 0 })).changes).toHaveLength(1);
  expect((await bob.query(api.delta, { seq: 0 })).changes).toHaveLength(0);
  const empty = new Doc();
  const vector = encodeStateVector(empty).buffer as ArrayBuffer;
  empty.destroy();
  await expect(
    bob.query(api.delta, { document: record.id, vector })
  ).rejects.toThrow("Unauthorized");
  await expect(
    t.query(api.delta, { document: record.id, vector })
  ).rejects.toThrow("Authentication required");
  const forged = new Doc();
  for (const [key, value] of Object.entries({ ...record, ownerId: bobId })) {
    forged.getMap("fields").set(key, value);
  }
  const bytes = encodeStateAsUpdateV2(forged).buffer as ArrayBuffer;
  forged.destroy();
  await expect(
    bob.mutation(api.replicate, {
      document: record.id,
      bytes,
      material: { ...record, ownerId: bobId },
      type: "update",
    })
  ).rejects.toThrow("Unauthorized");
  await client.update(record.id, (draft) => {
    draft.notes = "edited";
  }).isPersisted.promise;
  expect((await t.run((ctx) => ctx.db.query("shifts").unique()))?.notes).toBe(
    "edited"
  );
  await client.delete(record.id).isPersisted.promise;
  await tick();
  expect(client.get(record.id)).toBeUndefined();
  expect((await t.run((ctx) => ctx.db.query("shifts").unique()))?.deleted).toBe(
    true
  );
  await client.cleanup();
});
