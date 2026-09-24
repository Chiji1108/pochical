import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { Glob, sleep } from "bun";
import { convexTest } from "convex-test";
import { Doc, encodeStateAsUpdateV2 } from "yjs";
import { api, components, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import presenceSchema from "../node_modules/@convex-dev/presence/dist/component/schema.js";
import replicaSchema from "../node_modules/@trestleinc/replicate/dist/component/schema.js";
import unreadSchema from "../node_modules/convex-unread-tracking/dist/component/schema.js";
import { toDisplayMessage } from "../src/components/chat/chat-model";

const componentModules = (directory: string) =>
  Object.fromEntries(
    [...new Glob("**/*.js").scanSync(directory)].map((path) => [
      `./${path}`,
      () => import(resolve(directory, path)),
    ])
  );
const setup = () => {
  const t = convexTest(schema, {
    "./_generated/api.ts": () => import("../convex/_generated/api"),
    "./accountDeletion.ts": () => import("../convex/accountDeletion"),
    "./deleteAccount.ts": () => import("../convex/deleteAccount"),
    "./accounts.ts": () => import("../convex/accounts"),
    "./chat.ts": () => import("../convex/chat"),
    "./shifts.ts": () => import("../convex/shifts"),
  });
  t.registerComponent(
    "replicate",
    replicaSchema,
    componentModules("node_modules/@trestleinc/replicate/dist/component")
  );
  t.registerComponent(
    "unreadTracking",
    unreadSchema,
    componentModules("node_modules/convex-unread-tracking/dist/component")
  );
  t.registerComponent(
    "presence",
    presenceSchema,
    componentModules("node_modules/@convex-dev/presence/dist/component")
  );
  return t;
};

test("deletion erases linked workspace, quotes, credentials and replicas, retaining other members' messages", async () => {
  const t = setup();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { isAnonymous: true });
    const alice = await ctx.db.insert("users", {
      workspaceId: owner,
      email: "alice@example.test",
    });
    const bob = await ctx.db.insert("users", {});
    const group = await ctx.db.insert("groups", {
      name: "Shared",
      emoji: "a",
      inviteCode: "shared",
      createdBy: owner,
      createdAt: 1,
      updatedAt: 1,
    });
    for (const [userId, displayName] of [
      [owner, "Alice"],
      [bob, "Bob"],
    ]) {
      await ctx.db.insert("groupMembers", {
        groupId: group,
        userId,
        displayName,
        joinedAt: 1,
      });
    }
    const session = await ctx.db.insert("authSessions", {
      userId: alice,
      expirationTime: Date.now() + 60_000,
    });
    await ctx.db.insert("authRefreshTokens", {
      sessionId: session,
      expirationTime: Date.now() + 60_000,
    });
    await ctx.db.insert("authVerifiers", {
      sessionId: session,
      signature: "secret",
    });
    const account = await ctx.db.insert("authAccounts", {
      userId: alice,
      provider: "google",
      providerAccountId: "private-google-sub",
    });
    await ctx.db.insert("authVerificationCodes", {
      accountId: account,
      provider: "google",
      code: "secret",
      expirationTime: Date.now() + 60_000,
    });
    await ctx.db.insert("accountLinks", {
      sourceUserId: owner,
      completedTargetId: alice,
      tokenHash: "private",
      expiresAt: Date.now() + 60_000,
    });
    await ctx.db.insert("groupEvents", {
      groupId: group,
      actorUserId: bob,
      actorDisplayNameSnapshot: "Bob",
      body: "Alice removed",
      kind: "member_removed",
      targetUserId: owner,
      targetDisplayNameSnapshot: "Alice",
      createdAt: 1,
    });
    const solo = await ctx.db.insert("groups", {
      name: "Private",
      emoji: "a",
      inviteCode: "solo",
      createdBy: owner,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("groupMembers", {
      groupId: solo,
      userId: owner,
      displayName: "Alice",
      joinedAt: 1,
    });
    return { owner, alice, bob, group };
  });
  const alice = t.withIdentity({ subject: `${ids.alice}|session` });
  const bob = t.withIdentity({ subject: `${ids.bob}|session` });
  await alice.mutation(api.chat.sendGroupMessage, {
    groupId: ids.group,
    body: "Alice private message",
  });
  const original = (
    await bob.query(api.chat.listGroupMessages, {
      groupId: ids.group,
      paginationOpts: { numItems: 40, cursor: null },
    })
  ).page[0];
  await bob.mutation(api.chat.sendGroupMessage, {
    groupId: ids.group,
    body: "Bob preserved",
    replyToMessageId: original._id,
  });
  await alice.mutation(api.chat.toggleReaction, {
    messageId: original._id,
    emoji: "👍",
  });
  // Force multiple pages and keep the last preview authored by the departing user.
  await t.run(async (ctx) => {
    for (let i = 0; i < 65; i++) {
      await ctx.db.insert("chatMessages", {
        authorUserId: ids.owner,
        authorDisplayNameSnapshot: "Alice",
        body: "private",
        createdAt: i + 2,
        groupId: ids.group,
        threadId: original.threadId,
      });
    }
  });
  const doc = new Doc();
  for (const [key, value] of Object.entries({
    id: "private-shift",
    ownerId: ids.owner,
    startDate: 123,
    notes: "private notes",
    patternId: null,
    memberIds: [],
  })) {
    doc.getMap("fields").set(key, value);
  }
  const bytes = encodeStateAsUpdateV2(doc).buffer as ArrayBuffer;
  await alice.mutation(api.shifts.replicate, {
    document: "private-shift",
    bytes,
  });
  const receipt = await alice.action(api.deleteAccount.request, {});
  expect(await t.query(api.accountDeletion.pending, { receipt })).toBe(true);
  await expect(
    alice.mutation(api.shifts.replicate, { document: "private-shift", bytes })
  ).rejects.toThrow("Authentication required");
  await expect(
    bob.mutation(api.chat.sendGroupMessage, {
      groupId: ids.group,
      body: "late quote",
      replyToMessageId: original._id,
    })
  ).rejects.toThrow();
  for (let attempt = 0; attempt < 200; attempt++) {
    await sleep(5);
    await t.finishInProgressScheduledFunctions();
    if (!(await t.run((ctx) => ctx.db.query("accountDeletions").first()))) {
      break;
    }
  }
  const state = await t.run(async (ctx) => ({
    users: await ctx.db.query("users").collect(),
    groups: await ctx.db.query("groups").collect(),
    members: await ctx.db.query("groupMembers").collect(),
    messages: await ctx.db.query("chatMessages").collect(),
    events: await ctx.db.query("groupEvents").collect(),
    shifts: await ctx.db.query("shifts").collect(),
    sessions: await ctx.db.query("authSessions").collect(),
    tokens: await ctx.db.query("authRefreshTokens").collect(),
    verifiers: await ctx.db.query("authVerifiers").collect(),
    accounts: await ctx.db.query("authAccounts").collect(),
    codes: await ctx.db.query("authVerificationCodes").collect(),
    links: await ctx.db.query("accountLinks").collect(),
    jobs: await ctx.db.query("accountDeletions").collect(),
    replica: await ctx.runQuery(
      components.replicate.mutations.getDocumentState,
      { collection: `shifts:${ids.owner}`, document: "private-shift" }
    ),
  }));
  expect(state.users.map((user) => user._id)).toEqual([ids.bob]);
  expect(state.groups).toHaveLength(1);
  expect(state.members.map((member) => member.userId)).toEqual([ids.bob]);
  expect(state.messages).toHaveLength(67);
  const reply = state.messages.find(
    (message) => message.body === "Bob preserved"
  );
  expect(reply?.reply?.body).toBe("メッセージは削除されました");
  expect(reply?.reply?.authorDisplayName).toBe("削除済みのユーザー");
  expect(JSON.stringify(state)).not.toContain("Alice");
  expect(JSON.stringify(state)).not.toContain("private");
  for (const key of [
    "shifts",
    "sessions",
    "tokens",
    "verifiers",
    "accounts",
    "codes",
    "links",
    "jobs",
  ] as const) {
    expect(state[key]).toEqual([]);
  }
  expect(state.replica).toBeNull();
  expect(await t.query(api.accountDeletion.pending, { receipt })).toBe(false);
  const tombstone = state.messages.find(
    (message) => message._id === original._id
  )!;
  const display = toDisplayMessage(
    {
      ...tombstone,
      authorDisplayName: tombstone.authorDisplayNameSnapshot,
      readCount: 0,
    },
    "count"
  );
  expect(display.text).toBe("メッセージは削除されました");
  expect(display.messageId).toBeUndefined();
  await expect(
    alice.mutation(api.shifts.replicate, { document: "private-shift", bytes })
  ).rejects.toThrow("Authentication required");
  await sleep(0);
});

test("unauthenticated requests and missing Apple revocation credentials cannot start deletion", async () => {
  const t = setup();
  await expect(t.action(api.deleteAccount.request, {})).rejects.toThrow(
    "ログインが必要"
  );
  const id = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    await ctx.db.insert("authAccounts", {
      userId,
      provider: "apple",
      providerAccountId: "apple-sub",
    });
    return userId;
  });
  const user = t.withIdentity({ subject: `${id}|session` });
  await expect(user.action(api.deleteAccount.request, {})).rejects.toThrow(
    "Appleで再ログイン"
  );
  expect((await t.run((ctx) => ctx.db.get(id)))?.deletingAt).toBeUndefined();
  await expect(
    t.mutation(internal.accountDeletion.begin, {
      expectedUserId: id,
      receipt: "test",
    })
  ).rejects.toThrow();
});
