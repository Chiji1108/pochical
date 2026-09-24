import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import componentSchema from "../node_modules/convex-unread-tracking/dist/component/schema.js";
import {
  buildChatMessages,
  toDisplayMessage,
} from "../src/components/chat/chat-model";

const setup = async () => {
  const t = convexTest(schema, {
    "../convex/_generated/api.ts": () => import("../convex/_generated/api"),
    "../convex/chat.ts": () => import("../convex/chat"),
  });
  t.registerComponent("unreadTracking", componentSchema, {
    "./_generated/api.js": () =>
      import(
        "../node_modules/convex-unread-tracking/dist/component/_generated/api.js"
      ),
    "./public.js": () =>
      import("../node_modules/convex-unread-tracking/dist/component/public.js"),
  });
  const ids = await t.run(async (ctx) => {
    const aliceId = await ctx.db.insert("users", {});
    const bobId = await ctx.db.insert("users", {});
    const carolId = await ctx.db.insert("users", {});
    const outsiderId = await ctx.db.insert("users", {});
    const groupId = await ctx.db.insert("groups", {
      createdAt: 1,
      updatedAt: 1,
      createdBy: aliceId,
      emoji: "🐶",
      inviteCode: "chat-test",
      name: "Chat",
    });
    for (const [userId, displayName] of [
      [aliceId, "Alice"],
      [bobId, "Bob"],
      [carolId, "Carol"],
    ]) {
      await ctx.db.insert("groupMembers", {
        groupId,
        userId,
        displayName,
        joinedAt: 1,
      });
    }
    return { aliceId, bobId, carolId, outsiderId, groupId };
  });
  return {
    ...ids,
    t,
    alice: t.withIdentity({ subject: `${ids.aliceId}|session` }),
    bob: t.withIdentity({ subject: `${ids.bobId}|session` }),
    carol: t.withIdentity({ subject: `${ids.carolId}|session` }),
    outsider: t.withIdentity({ subject: `${ids.outsiderId}|session` }),
  };
};
const paginationOpts = { cursor: null, numItems: 40 };

test("group replies persist a server-authored quote and retain read receipts", async () => {
  const { alice, bob, groupId, aliceId } = await setup();
  await alice.mutation(api.chat.sendGroupMessage, {
    groupId,
    body: " 元のメッセージ ",
  });
  const original = (
    await bob.query(api.chat.listGroupMessages, { groupId, paginationOpts })
  ).page[0];
  await bob.mutation(api.chat.sendGroupMessage, {
    groupId,
    body: "返信",
    replyToMessageId: original._id,
  });
  await bob.mutation(api.chat.markGroupRead, { groupId });
  const page = (
    await alice.query(api.chat.listGroupMessages, { groupId, paginationOpts })
  ).page;
  const reply = page.find((message) => message.body === "返信");
  expect(reply?.reply).toEqual({
    messageId: original._id,
    authorUserId: aliceId,
    authorDisplayName: "Alice",
    body: "元のメッセージ",
  });
  expect(page.find((message) => message._id === original._id)?.readCount).toBe(
    1
  );
  expect(toDisplayMessage(reply!, "count").replyMessage?.text).toBe(
    "元のメッセージ"
  );
});

test("reactions toggle per user, sync to other readers, and do not mark a message read", async () => {
  const { alice, bob, groupId, aliceId, bobId } = await setup();
  await alice.mutation(api.chat.sendGroupMessage, { groupId, body: "Hello" });
  const message = (
    await alice.query(api.chat.listGroupMessages, { groupId, paginationOpts })
  ).page[0];
  const reaction = { messageId: message._id, emoji: "🦊" };
  await bob.mutation(api.chat.toggleReaction, reaction);
  await alice.mutation(api.chat.toggleReaction, reaction);
  let updated = (
    await bob.query(api.chat.listGroupMessages, { groupId, paginationOpts })
  ).page[0];
  expect(updated.reactions).toEqual([
    { emoji: "🦊", userIds: [bobId, aliceId] },
  ]);
  expect(updated.readCount).toBe(0);
  await bob.mutation(api.chat.toggleReaction, reaction);
  updated = (
    await alice.query(api.chat.listGroupMessages, { groupId, paginationOpts })
  ).page[0];
  expect(updated.reactions).toEqual([{ emoji: "🦊", userIds: [aliceId] }]);
  await alice.mutation(api.chat.toggleReaction, reaction);
  expect(
    (await bob.query(api.chat.listGroupMessages, { groupId, paginationOpts }))
      .page[0].reactions
  ).toEqual([]);
});

test("direct chat replies work only within their conversation and reactions require participation", async () => {
  const { alice, bob, carol, outsider, t, groupId, aliceId, bobId, carolId } =
    await setup();
  await alice.mutation(api.chat.sendDirectMessage, {
    groupId,
    targetUserId: bobId,
    body: "Private",
  });
  const original = (
    await bob.query(api.chat.listDirectMessages, {
      groupId,
      targetUserId: aliceId,
      paginationOpts,
    })
  ).page[0];
  await bob.mutation(api.chat.sendDirectMessage, {
    groupId,
    targetUserId: aliceId,
    body: "Private reply",
    replyToMessageId: original._id,
  });
  const page = (
    await alice.query(api.chat.listDirectMessages, {
      groupId,
      targetUserId: bobId,
      paginationOpts,
    })
  ).page;
  expect(
    page.find((message) => message.body === "Private reply")?.reply?.body
  ).toBe("Private");
  for (const user of [t, carol, outsider]) {
    await expect(
      user.mutation(api.chat.toggleReaction, {
        messageId: original._id,
        emoji: "👍",
      })
    ).rejects.toThrow();
  }
  await expect(
    alice.mutation(api.chat.sendGroupMessage, {
      groupId,
      body: "Leak",
      replyToMessageId: original._id,
    })
  ).rejects.toThrow();
  await expect(
    alice.mutation(api.chat.sendDirectMessage, {
      groupId,
      targetUserId: carolId,
      body: "Leak",
      replyToMessageId: original._id,
    })
  ).rejects.toThrow();
  await expect(
    carol.mutation(api.chat.sendDirectMessage, {
      groupId,
      targetUserId: bobId,
      body: "Leak",
      replyToMessageId: original._id,
    })
  ).rejects.toThrow();
  await bob.mutation(api.chat.toggleReaction, {
    messageId: original._id,
    emoji: "❤️",
  });
  await bob.mutation(api.chat.markDirectRead, {
    groupId,
    targetUserId: aliceId,
  });
  const read = (
    await alice.query(api.chat.listDirectMessages, {
      groupId,
      targetUserId: bobId,
      paginationOpts,
    })
  ).page.find((message) => message._id === original._id);
  expect(read?.readCount).toBe(1);
});

test("deleted messages, former members, outsiders, and unsupported reactions are rejected", async () => {
  const { alice, bob, outsider, t, groupId, bobId } = await setup();
  await alice.mutation(api.chat.sendGroupMessage, { groupId, body: "Hello" });
  const original = (
    await alice.query(api.chat.listGroupMessages, { groupId, paginationOpts })
  ).page[0];
  const reaction = { messageId: original._id, emoji: "👍" };
  await expect(
    outsider.mutation(api.chat.toggleReaction, reaction)
  ).rejects.toThrow();
  await expect(
    alice.mutation(api.chat.toggleReaction, {
      ...reaction,
      emoji: "not-an-emoji",
    })
  ).rejects.toThrow();
  await t.run(async (ctx) => {
    const member = await ctx.db
      .query("groupMembers")
      .withIndex("by_groupId_userId", (q) =>
        q.eq("groupId", groupId).eq("userId", bobId)
      )
      .unique();
    await ctx.db.delete(member!._id);
  });
  await expect(
    bob.mutation(api.chat.toggleReaction, reaction)
  ).rejects.toThrow();
  await t.run((ctx) => ctx.db.patch(original._id, { deletedAt: 1 }));
  await expect(
    alice.mutation(api.chat.toggleReaction, reaction)
  ).rejects.toThrow();
  await expect(
    alice.mutation(api.chat.sendGroupMessage, {
      groupId,
      body: "Reply",
      replyToMessageId: original._id,
    })
  ).rejects.toThrow();
  await expect(
    alice.mutation(api.chat.sendGroupMessage, {
      groupId,
      body: "a".repeat(1001),
    })
  ).rejects.toThrow();
});

test("the UI adapter preserves legacy messages, pending state and event chronology", async () => {
  const { alice, groupId } = await setup();
  await alice.mutation(api.chat.sendGroupMessage, { groupId, body: "Legacy" });
  const message = (
    await alice.query(api.chat.listGroupMessages, { groupId, paginationOpts })
  ).page[0];
  expect(toDisplayMessage(message, "direct")).toMatchObject({
    text: "Legacy",
    sent: true,
    pending: false,
    readCount: 0,
  });
  const pending = toDisplayMessage(
    { ...message, _id: "message:pending" as typeof message._id },
    "count"
  );
  expect(pending.pending).toBe(true);
  expect(pending.messageId).toBeUndefined();
  const timeline = buildChatMessages(
    [message],
    [
      {
        _id: "event",
        actorUserId: message.authorUserId,
        actorDisplayNameSnapshot: "Alice",
        kind: "group_name_updated",
        body: "Changed",
        previousValue: "Old",
        nextValue: "New",
        createdAt: message.createdAt + 1,
      },
    ],
    message.authorUserId,
    "count"
  );
  expect(timeline[0]).toMatchObject({
    system: true,
    text: "あなたがグループ名を「Old」から「New」に変更しました",
  });
  expect(timeline[1]._id).toBe(message._id);
});

test("accepts full emoji reactions and rejects text or multiple emoji", async () => {
  const { isReactionEmoji } = await import("../shared/chat");
  for (const emoji of ["🦊", "👍🏽", "👨‍👩‍👧‍👦", "🇯🇵", "1️⃣", "❤️"]) {
    expect(isReactionEmoji(emoji)).toBe(true);
  }
  for (const value of ["", "hello", "👍👍", "＋", "a🦊", "🦊\n"]) {
    expect(isReactionEmoji(value)).toBe(false);
  }
});
