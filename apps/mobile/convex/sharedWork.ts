import { v } from "convex/values";
import { requireUserId } from "../convex-lib/auth";
import { requireDirectMembership } from "../convex-lib/groupMembers";
import { query } from "./_generated/server";

export const forMember = query({
  args: {
    groupId: v.id("groups"),
    memberUserId: v.string(),
    start: v.number(),
    end: v.number(),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireUserId(ctx);
    await requireDirectMembership(
      ctx,
      args.groupId,
      currentUserId,
      args.memberUserId
    );
    const patterns = await ctx.db
      .query("shiftPatterns")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", args.memberUserId))
      .collect();
    const shifts = await ctx.db
      .query("shifts")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", args.memberUserId))
      .filter((q) =>
        q.and(
          q.gte(q.field("startDate"), args.start),
          q.lte(q.field("startDate"), args.end)
        )
      )
      .collect();
    return {
      patterns: patterns
        .filter((row) => !row.deleted)
        .map(
          ({ _id, _creationTime, timestamp, deleted, ...pattern }) => pattern
        ),
      // Group calendars display shift labels, never private notes or coworkers.
      shifts: shifts
        .filter((row) => !row.deleted)
        .map(({ _id, _creationTime, timestamp, deleted, ...shift }) => ({
          ...shift,
          notes: "",
          memberIds: [],
        })),
    };
  },
});
