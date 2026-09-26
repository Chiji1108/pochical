import { v } from "convex/values";

export const chatReplyValidator = v.object({
  messageId: v.id("chatMessages"),
  authorUserId: v.string(),
  authorDisplayName: v.string(),
  body: v.string(),
});

export const chatMessageFields = {
  authorDisplayNameSnapshot: v.string(),
  authorUserId: v.string(),
  body: v.string(),
  createdAt: v.number(),
  deletedAt: v.optional(v.number()),
  groupId: v.id("groups"),
  threadId: v.id("chatThreads"),
  reply: v.optional(chatReplyValidator),
  reactions: v.optional(
    v.array(
      v.object({
        emoji: v.string(),
        userIds: v.array(v.string()),
      })
    )
  ),
};

export const chatMessageValidator = v.object({
  ...chatMessageFields,
  _id: v.id("chatMessages"),
  _creationTime: v.number(),
  authorDisplayName: v.string(),
});

export const chatReadStateValidator = v.object({
  lastReadAt: v.number(),
  userId: v.string(),
});
