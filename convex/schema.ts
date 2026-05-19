import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  groups: defineTable({
    createdAt: v.number(),
    createdBy: v.string(),
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
});
