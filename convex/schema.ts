import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { chatMessageFields } from "../shared/chat-schema";
import {
  memberFields,
  patternFields,
  shiftFields,
} from "../shared/work-schema";

export default defineSchema({
  ...authTables,
  users: defineTable({
    ...authTables.users.validator.fields,
    workspaceId: v.optional(v.id("users")),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  nativeAuthChallenges: defineTable({
    provider: v.union(v.literal("apple"), v.literal("google")),
    nonce: v.string(),
    expiresAt: v.number(),
  }),
  accountLinks: defineTable({
    tokenHash: v.string(),
    sourceUserId: v.id("users"),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    completedTargetId: v.optional(v.id("users")),
  }).index("by_tokenHash", ["tokenHash"]),
  shiftPatterns: defineTable({
    ...patternFields,
    deleted: v.boolean(),
    timestamp: v.number(),
  })
    .index("by_doc_id", ["id"])
    .index("by_ownerId", ["ownerId"]),
  shiftMembers: defineTable({
    ...memberFields,
    deleted: v.boolean(),
    timestamp: v.number(),
  })
    .index("by_doc_id", ["id"])
    .index("by_ownerId", ["ownerId"]),
  shifts: defineTable({
    ...shiftFields,
    deleted: v.boolean(),
    timestamp: v.number(),
  })
    .index("by_doc_id", ["id"])
    .index("by_ownerId", ["ownerId"]),
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
    userId: v.string(),
    joinedAt: v.number(),
  })
    .index("by_groupId", ["groupId"])
    .index("by_userId", ["userId"])
    .index("by_groupId_userId", ["groupId", "userId"]),
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
  chatMessages: defineTable(chatMessageFields).index("by_threadId_createdAt", [
    "threadId",
    "createdAt",
  ]),
  groupEvents: defineTable({
    actorDisplayNameSnapshot: v.string(),
    actorUserId: v.string(),
    body: v.string(),
    createdAt: v.number(),
    groupId: v.id("groups"),
    kind: v.union(
      v.literal("group_name_updated"),
      v.literal("group_emoji_updated"),
      v.literal("display_name_updated"),
      v.literal("invite_code_regenerated"),
      v.literal("member_joined"),
      v.literal("member_left"),
      v.literal("member_removed")
    ),
    nextValue: v.optional(v.string()),
    previousValue: v.optional(v.string()),
    targetDisplayNameSnapshot: v.optional(v.string()),
    targetUserId: v.optional(v.string()),
  })
    .index("by_groupId_createdAt", ["groupId", "createdAt"])
    .index("by_groupId_kind_createdAt", ["groupId", "kind", "createdAt"]),
});
