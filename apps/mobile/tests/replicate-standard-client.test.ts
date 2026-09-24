import { expect, test } from "bun:test";
import { collection } from "@trestleinc/replicate/server";
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import {
  applyUpdateV2,
  Doc,
  encodeStateAsUpdateV2,
  encodeStateVector,
} from "yjs";
import componentSchema from "../../../node_modules/@trestleinc/replicate/dist/component/schema.js";
import { components } from "../convex/_generated/api";
import schema from "../convex/schema";

// Isolated feasibility probe: these generated endpoints are never deployed.
const standard = collection.create(components.replicate, "shifts", {
  view: async (ctx, query) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required");
    }
    return query.withIndex("by_ownerId", (q) =>
      q.eq("ownerId", identity.subject)
    );
  },
});
const material = makeFunctionReference<"query">("probe:material");
const delta = makeFunctionReference<"query">("probe:delta");
const setup = async () => {
  const t = convexTest(schema, {
    "./_generated/api.ts": () => import("../convex/_generated/api"),
    "./probe.ts": async () => standard,
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
  const owner = await t.run((ctx) =>
    ctx.db.insert("users", { isAnonymous: true })
  );
  const record = {
    id: "private-shift",
    ownerId: owner,
    startDate: 123,
    notes: "private calendar note",
    patternId: null,
    memberIds: [],
  };
  const doc = new Doc();
  for (const [key, value] of Object.entries(record)) {
    doc.getMap("fields").set(key, value);
  }
  const bytes = encodeStateAsUpdateV2(doc).buffer as ArrayBuffer;
  doc.destroy();
  await t.run(async (ctx) => {
    await ctx.db.insert("shifts", {
      ...record,
      timestamp: 1,
      deleted: false,
    });
    await ctx.runMutation(components.replicate.mutations.updateDocument, {
      collection: "shifts",
      document: record.id,
      bytes,
    });
  });
  return { t, owner };
};
const decodeNote = (bytes: ArrayBuffer) => {
  const doc = new Doc();
  applyUpdateV2(doc, new Uint8Array(bytes));
  const note = doc.getMap("fields").get("notes");
  doc.destroy();
  return note;
};

test("standard material query enforces the configured user view", async () => {
  const { t, owner } = await setup();
  const own = await t.withIdentity({ subject: owner }).query(material, {});
  const other = await t
    .withIdentity({ subject: "another-user" })
    .query(material, {});
  expect(own.documents).toHaveLength(1);
  expect(other.documents).toHaveLength(0);
  await expect(t.query(material, {})).rejects.toThrow(
    "Authentication required"
  );
});

test("probe: standard delta still sends excluded CRDT bytes", async () => {
  const { t } = await setup();
  const result = await t
    .withIdentity({ subject: "another-user" })
    .query(delta, { seq: 0 });
  expect(result.changes).toHaveLength(1);
  expect(result.changes[0].exists).toBe(false);
  expect(decodeNote(result.changes[0].bytes)).toBe("private calendar note");
});

test("probe: standard recovery bypasses the view even without authentication", async () => {
  const { t } = await setup();
  const empty = new Doc();
  const result = await t.query(delta, {
    document: "private-shift",
    vector: encodeStateVector(empty).buffer as ArrayBuffer,
  });
  empty.destroy();
  expect(result.mode).toBe("recovery");
  expect(decodeNote(result.diff)).toBe("private calendar note");
});
