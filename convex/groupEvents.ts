import { v } from "convex/values";
import {
  requireDirectMembership,
  requireMembership,
} from "../convex-lib/groupMembers";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, query } from "./_generated/server";

export type GroupEventInput = {
  actorDisplayNameSnapshot: string;
  actorJazzUserId: string;
  body: string;
  createdAt: number;
  groupId: Id<"groups">;
  kind: Doc<"groupEvents">["kind"];
  nextValue?: string;
  previousValue?: string;
  targetDisplayNameSnapshot?: string;
  targetJazzUserId?: string;
};

export const insertGroupEvent = async (
  ctx: MutationCtx,
  event: GroupEventInput
) => {
  await ctx.db.insert("groupEvents", event);
};

export const deleteGroupEvents = async (
  ctx: MutationCtx,
  groupId: Id<"groups">
) => {
  const events = await ctx.db
    .query("groupEvents")
    .withIndex("by_groupId_createdAt", (q) => q.eq("groupId", groupId))
    .collect();

  for (const event of events) {
    await ctx.db.delete(event._id);
  }
};

const listEventsForGroup = (ctx: QueryCtx, groupId: Id<"groups">) =>
  ctx.db
    .query("groupEvents")
    .withIndex("by_groupId_createdAt", (q) => q.eq("groupId", groupId))
    .order("desc")
    .collect();

export const listGroup = query({
  args: {
    groupId: v.id("groups"),
    jazzUserId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.groupId, args.jazzUserId);

    return listEventsForGroup(ctx, args.groupId);
  },
});

export const listDirect = query({
  args: {
    groupId: v.id("groups"),
    jazzUserId: v.string(),
    targetJazzUserId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireDirectMembership(
      ctx,
      args.groupId,
      args.jazzUserId,
      args.targetJazzUserId
    );
    const participantJazzUserIds = new Set([
      args.jazzUserId,
      args.targetJazzUserId,
    ]);
    const events = await listEventsForGroup(ctx, args.groupId);

    return events.filter(
      (event) =>
        event.kind === "display_name_updated" &&
        participantJazzUserIds.has(event.actorJazzUserId)
    );
  },
});
