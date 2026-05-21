import { paginationOptsValidator } from "convex/server";
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

const listEventsForGroup = (
  ctx: QueryCtx,
  groupId: Id<"groups">,
  paginationOpts: {
    cursor: string | null;
    numItems: number;
    endCursor?: string | null;
    id?: number;
    maximumBytesRead?: number;
    maximumRowsRead?: number;
  }
) =>
  ctx.db
    .query("groupEvents")
    .withIndex("by_groupId_createdAt", (q) => q.eq("groupId", groupId))
    .order("desc")
    .paginate(paginationOpts);

const listDisplayNameEventsForGroup = (
  ctx: QueryCtx,
  groupId: Id<"groups">,
  paginationOpts: {
    cursor: string | null;
    numItems: number;
    endCursor?: string | null;
    id?: number;
    maximumBytesRead?: number;
    maximumRowsRead?: number;
  }
) =>
  ctx.db
    .query("groupEvents")
    .withIndex("by_groupId_kind_createdAt", (q) =>
      q.eq("groupId", groupId).eq("kind", "display_name_updated")
    )
    .order("desc")
    .paginate(paginationOpts);

export const listGroup = query({
  args: {
    groupId: v.id("groups"),
    jazzUserId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.groupId, args.jazzUserId);

    return listEventsForGroup(ctx, args.groupId, args.paginationOpts);
  },
});

export const listDirect = query({
  args: {
    groupId: v.id("groups"),
    jazzUserId: v.string(),
    paginationOpts: paginationOptsValidator,
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
    const events = await listDisplayNameEventsForGroup(
      ctx,
      args.groupId,
      args.paginationOpts
    );

    return {
      ...events,
      page: events.page.filter((event) =>
        participantJazzUserIds.has(event.actorJazzUserId)
      ),
    };
  },
});
