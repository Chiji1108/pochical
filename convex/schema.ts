import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  groups: defineTable({
    createdAt: v.number(),
    createdBy: v.string(),
    emoji: v.string(),
    inviteCode: v.string(),
    name: v.string(),
    updatedAt: v.number(),
  }).index("by_inviteCode", ["inviteCode"]),
  groupMembers: defineTable({
    displayName: v.string(),
    groupId: v.id("groups"),
    jazzUserId: v.string(),
    joinedAt: v.number(),
  })
    .index("by_groupId", ["groupId"])
    .index("by_jazzUserId", ["jazzUserId"])
    .index("by_groupId_jazzUserId", ["groupId", "jazzUserId"]),
  chatThreads: defineTable({
    directParticipantA: v.optional(v.string()),
    directParticipantB: v.optional(v.string()),
    groupId: v.id("groups"),
    kind: v.union(v.literal("group"), v.literal("direct")),
    lastMessageCreatedAt: v.optional(v.number()),
    lastMessagePreview: v.optional(v.string()),
    pairKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_groupId_kind_pairKey", ["groupId", "kind", "pairKey"])
    .index("by_groupId_updatedAt", ["groupId", "updatedAt"]),
  chatMessages: defineTable({
    authorDisplayNameSnapshot: v.string(),
    authorJazzUserId: v.string(),
    body: v.string(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
    groupId: v.id("groups"),
    threadId: v.id("chatThreads"),
  }).index("by_threadId_createdAt", ["threadId", "createdAt"]),
  chatEvents: defineTable({
    actorDisplayNameSnapshot: v.string(),
    actorJazzUserId: v.string(),
    body: v.string(),
    createdAt: v.number(),
    groupId: v.id("groups"),
    kind: v.union(
      v.literal("group_name_updated"),
      v.literal("group_emoji_updated"),
      v.literal("display_name_updated"),
      v.literal("member_joined"),
      v.literal("member_left"),
      v.literal("member_removed")
    ),
    nextValue: v.optional(v.string()),
    previousValue: v.optional(v.string()),
    targetDisplayNameSnapshot: v.optional(v.string()),
    targetJazzUserId: v.optional(v.string()),
  }).index("by_groupId_createdAt", ["groupId", "createdAt"]),
  chatReads: defineTable({
    jazzUserId: v.string(),
    lastReadMessageCreatedAt: v.number(),
    threadId: v.id("chatThreads"),
    updatedAt: v.number(),
  }).index("by_threadId_jazzUserId", ["threadId", "jazzUserId"]),
});
