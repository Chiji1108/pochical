import { expect, test } from "bun:test";
import { CryptoHasher, sleep } from "bun";
import { convexTest } from "convex-test";
import { applyUpdateV2, Doc, encodeStateAsUpdateV2 } from "yjs";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import componentSchema from "../node_modules/@trestleinc/replicate/dist/component/schema.js";
import { WorkSync } from "../src/lib/work-sync";

const modules = {
  "../convex/_generated/api.ts": () => import("../convex/_generated/api"),
  "../convex/shiftPatterns.ts": () => import("../convex/shiftPatterns"),
  "../convex/shiftMembers.ts": () => import("../convex/shiftMembers"),
  "../convex/shifts.ts": () => import("../convex/shifts"),
  "../convex/groups.ts": () => import("../convex/groups"),
  "../convex/accounts.ts": () => import("../convex/accounts"),
  "../convex/sharedWork.ts": () => import("../convex/sharedWork"),
};
const setup = () => {
  const t = convexTest(schema, modules);
  t.registerComponent("replicate", componentSchema, {
    "./_generated/api.js": () =>
      import(
        "../node_modules/@trestleinc/replicate/dist/component/_generated/api.js"
      ),
    "./mutations.js": () =>
      import(
        "../node_modules/@trestleinc/replicate/dist/component/mutations.js"
      ),
  });
  return t;
};
const record = (ownerId: string) => ({
  id: "shift-a",
  ownerId,
  startDate: 123,
  notes: "original",
  patternId: null,
  memberIds: [],
});
const encode = (value: object) => {
  const doc = new Doc();
  for (const [key, item] of Object.entries(value)) {
    doc.getMap("fields").set(key, item);
  }
  return encodeStateAsUpdateV2(doc).buffer as ArrayBuffer;
};

test("authenticated streams isolate users and reject forged document ownership", async () => {
  const t = setup();
  const [aliceId, bobId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { isAnonymous: true }),
    await ctx.db.insert("users", { isAnonymous: true }),
  ]);
  const alice = t.withIdentity({ subject: `${aliceId}|session` });
  const bob = t.withIdentity({ subject: `${bobId}|session` });
  await alice.mutation(api.shifts.replicate, {
    document: "shift-a",
    bytes: encode(record(aliceId)),
  });
  expect((await alice.query(api.shifts.snapshot, {})).length).toBe(1);
  expect(await bob.query(api.shifts.snapshot, {})).toEqual([]);
  await expect(
    bob.mutation(api.shifts.replicate, {
      document: "shift-a",
      bytes: encode(record(bobId)),
    })
  ).rejects.toThrow("Unauthorized");
  await expect(t.query(api.shifts.snapshot, {})).rejects.toThrow(
    "Authentication required"
  );
  await expect(
    bob.query(api.sharedWork.forMember, {
      groupId: await t.run((ctx) =>
        ctx.db.insert("groups", {
          createdAt: 1,
          createdBy: aliceId,
          emoji: "a",
          inviteCode: "x",
          name: "a",
          updatedAt: 1,
        })
      ),
      memberUserId: aliceId,
      start: 0,
      end: 999,
    })
  ).rejects.toThrow("Group not found");
});

test("server merges concurrent edits and a stale edit cannot resurrect deletion", async () => {
  const t = setup();
  const id = await t.run((ctx) =>
    ctx.db.insert("users", { isAnonymous: true })
  );
  const user = t.withIdentity({ subject: `${id}|session` });
  const initial = encode(record(id));
  const a = new Doc();
  const b = new Doc();
  applyUpdateV2(a, new Uint8Array(initial));
  applyUpdateV2(b, new Uint8Array(initial));
  a.getMap("fields").set("notes", "edited");
  b.getMap("fields").set("startDate", 456);
  for (const doc of [a, b]) {
    await user.mutation(api.shifts.replicate, {
      document: "shift-a",
      bytes: encodeStateAsUpdateV2(doc).buffer as ArrayBuffer,
    });
  }
  const saved = await t.run((ctx) => ctx.db.query("shifts").unique());
  expect(saved?.notes).toBe("edited");
  expect(saved?.startDate).toBe(456);
  a.getMap("meta").set("deleted", true);
  await user.mutation(api.shifts.replicate, {
    document: "shift-a",
    bytes: encodeStateAsUpdateV2(a).buffer as ArrayBuffer,
  });
  await user.mutation(api.shifts.replicate, {
    document: "shift-a",
    bytes: encodeStateAsUpdateV2(b).buffer as ArrayBuffer,
  });
  expect((await t.run((ctx) => ctx.db.query("shifts").unique()))?.deleted).toBe(
    true
  );
});

test("offline changes survive restart, including deletion, and retry exactly until acknowledged", async () => {
  let disk: string | undefined;
  const offline = () => Promise.reject(new Error("offline"));
  const store = new WorkSync(
    "alice",
    disk,
    (value) => {
      disk = value;
    },
    offline
  );
  store.change([
    { table: "shifts", id: "shift-a", values: record("alice"), create: true },
  ]);
  await sleep(0);
  expect(store.getSnapshot().shifts[0].notes).toBe("original");
  store.close();
  const sent: string[] = [];
  const restored = new WorkSync(
    "alice",
    disk,
    (value) => {
      disk = value;
    },
    (_table, id) => {
      sent.push(id);
      return Promise.resolve();
    }
  );
  expect(restored.getSnapshot().shifts.length).toBe(1);
  await restored.flush();
  await restored.flush();
  expect(sent).toEqual(["shift-a"]);
  restored.close();
  const deleting = new WorkSync(
    "alice",
    disk,
    (value) => {
      disk = value;
    },
    offline
  );
  deleting.change([{ table: "shifts", id: "shift-a", remove: true }]);
  await sleep(0);
  deleting.close();
  const restart = new WorkSync(
    "alice",
    disk,
    (value) => {
      disk = value;
    },
    (_table, id) => {
      sent.push(id);
      return Promise.resolve();
    }
  );
  expect(restart.getSnapshot().shifts).toEqual([]);
  await restart.flush();
  expect(sent).toEqual(["shift-a", "shift-a"]);
});

test("account linking keeps the anonymous workspace and requires a one-time handover secret", async () => {
  const t = setup();
  const source = await t.run((ctx) =>
    ctx.db.insert("users", { isAnonymous: true })
  );
  const guest = t.withIdentity({ subject: `${source}|guest` });
  await guest.mutation(api.shifts.replicate, {
    document: "shift-a",
    bytes: encode(record(source)),
  });
  const secret = "test-link-secret";
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret)
  );
  const tokenHash = Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
  await guest.mutation(api.accounts.prepareLink, { tokenHash });
  const target = await t.run((ctx) =>
    ctx.db.insert("users", { email: "a@example.com" })
  );
  const formal = t.withIdentity({ subject: `${target}|formal` });
  await expect(
    guest.mutation(api.accounts.completeLink, { secret })
  ).rejects.toThrow("Sign in with Apple or Google first");
  await expect(
    formal.mutation(api.accounts.completeLink, { secret: "wrong" })
  ).rejects.toThrow("expired");
  await formal.mutation(api.accounts.completeLink, { secret });
  expect((await formal.query(api.accounts.current, {}))?.userId).toBe(source);
  expect((await formal.query(api.shifts.snapshot, {})).length).toBe(1);
  await formal.mutation(api.accounts.completeLink, { secret });
  const third = await t.run((ctx) =>
    ctx.db.insert("users", { email: "other@example.com" })
  );
  await expect(
    t
      .withIdentity({ subject: `${third}|third` })
      .mutation(api.accounts.completeLink, { secret })
  ).rejects.toThrow("already used");
});

test("late note flush cannot recreate a missing or deleted shift", () => {
  const store = new WorkSync(
    "alice",
    undefined,
    () => undefined,
    () => Promise.resolve()
  );
  store.change([{ table: "shifts", id: "missing", values: { notes: "late" } }]);
  expect(store.getSnapshot().shifts).toEqual([]);
});

test("unified login preserves existing accounts, including empty calendars", async () => {
  for (const withData of [false, true]) {
    const t = setup();
    const [source, target] = await t.run(async (ctx) => [
      await ctx.db.insert("users", { isAnonymous: true }),
      await ctx.db.insert("users", { isAnonymous: false }),
    ]);
    const guest = t.withIdentity({ subject: `${source}|guest` });
    const formal = t.withIdentity({ subject: `${target}|formal` });
    if (withData) {
      await formal.mutation(api.shifts.replicate, {
        document: "shift-a",
        bytes: encode(record(target)),
      });
    }
    const secret = "existing-account-login";
    const tokenHash = new CryptoHasher("sha256").update(secret).digest("hex");
    await guest.mutation(api.accounts.prepareLink, { tokenHash });
    await formal.mutation(api.accounts.completeLink, { secret });
    await formal.mutation(api.accounts.completeLink, { secret });
    expect((await formal.query(api.accounts.current, {}))?.userId).toBe(target);
    expect((await formal.query(api.shifts.snapshot, {})).length).toBe(
      withData ? 1 : 0
    );
    expect((await guest.query(api.accounts.current, {}))?.userId).toBe(source);
  }
});
