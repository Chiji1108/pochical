import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

import { toggleMessageReaction } from "../../../shared/chat";

export const optimisticallyToggleReaction = (
  store: OptimisticLocalStore,
  { messageId, emoji }: FunctionArgs<typeof api.chat.toggleReaction>,
  currentUserId: string
) => {
  if (!currentUserId) {
    return;
  }
  for (const query of [
    api.chat.listGroupMessages,
    api.chat.listDirectMessages,
  ]) {
    for (const { args, value } of store.getAllQueries(query)) {
      if (!value?.page.some((message) => message._id === messageId)) {
        continue;
      }
      store.setQuery(query, args, {
        ...value,
        page: value.page.map((message) => {
          if (message._id !== messageId || message.deletedAt !== undefined) {
            return message;
          }
          return {
            ...message,
            reactions: toggleMessageReaction(
              message.reactions ?? [],
              emoji,
              currentUserId
            ),
          };
        }),
      });
    }
  }
};
