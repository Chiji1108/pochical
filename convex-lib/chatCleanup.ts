import type { Id } from "../convex/_generated/dataModel";
import type { MutationCtx } from "../convex/_generated/server";
import { deleteGroupEvents } from "../convex/groupEvents";
import { archiveUnreadThread } from "./unreads";

export const deleteGroupChatData = async (
  ctx: MutationCtx,
  groupId: Id<"groups">
) => {
  await deleteGroupEvents(ctx, groupId);

  const threads = await ctx.db
    .query("chatThreads")
    .withIndex("by_groupId_updatedAt", (q) => q.eq("groupId", groupId))
    .collect();

  for (const thread of threads) {
    await archiveUnreadThread(ctx, thread._id);

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_threadId_createdAt", (q) => q.eq("threadId", thread._id))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    await ctx.db.delete(thread._id);
  }
};
