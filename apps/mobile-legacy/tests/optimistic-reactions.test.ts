import { expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
// Exercise rollback and replay through the installed Convex client's engine.
import { OptimisticQueryResults } from "../../../node_modules/convex/src/browser/sync/optimistic_updates_impl";
import { serializePathAndArgs } from "../../../node_modules/convex/src/browser/sync/udf_path_utils";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { optimisticallyToggleReaction } from "../src/components/chat/optimistic-reactions";

const messageId = "saved-message" as Id<"chatMessages">;
const setup = (
  query: typeof api.chat.listGroupMessages | typeof api.chat.listDirectMessages
) => {
  const udfPath = getFunctionName(query);
  const args = {
    groupId: "group",
    ...(udfPath === "chat:listDirectMessages" ? { targetUserId: "bob" } : {}),
    paginationOpts: { numItems: 40, cursor: "older-page" },
  };
  const token = serializePathAndArgs(udfPath, args);
  const value = {
    page: [
      { _id: messageId, reactions: [{ emoji: "👍", userIds: ["bob"] }] },
      { _id: "unrelated-message" },
    ],
    isDone: false,
    continueCursor: "next-page",
  };
  const server = new Map([
    [
      token,
      {
        udfPath,
        args,
        result: { success: true as const, value, logLines: [] },
      },
    ],
  ]);
  const client = new OptimisticQueryResults();
  client.ingestQueryResultsFromServer(server, new Set());
  const toggle = (emoji: string, mutationId: number) =>
    client.applyOptimisticUpdate(
      (store) =>
        optimisticallyToggleReaction(store, { messageId, emoji }, "alice"),
      mutationId
    );
  const read = () => client.queryResult(token) as typeof value;
  return { client, read, server, toggle, value };
};

for (const query of [api.chat.listGroupMessages, api.chat.listDirectMessages]) {
  test(`${getFunctionName(query)} preserves existing reaction order optimistically and on rollback`, () => {
    const { client, read, server, toggle } = setup(query);
    toggle("❤️", 1);
    toggle("😂", 2);
    toggle("👍", 3);
    expect(read().page[0].reactions?.map((reaction) => reaction.emoji)).toEqual(
      ["👍", "❤️", "😂"]
    );
    toggle("👍", 4);
    expect(read().page[0].reactions?.map((reaction) => reaction.emoji)).toEqual(
      ["👍", "❤️", "😂"]
    );
    client.ingestQueryResultsFromServer(server, new Set([3, 4]));
    expect(read().page[0].reactions?.map((reaction) => reaction.emoji)).toEqual(
      ["👍", "❤️", "😂"]
    );
  });
  test(`${getFunctionName(query)} adds and removes immediately without mutating server data`, () => {
    const { read, toggle, value } = setup(query);
    toggle("👍", 1);
    expect(read().page[0].reactions).toEqual([
      { emoji: "👍", userIds: ["bob", "alice"] },
    ]);
    expect(value.page[0].reactions).toEqual([
      { emoji: "👍", userIds: ["bob"] },
    ]);
    expect(read().page[1]).toBe(value.page[1]);
    expect(read().continueCursor).toBe("next-page");
    toggle("👍", 2);
    expect(read().page[0].reactions).toEqual([
      { emoji: "👍", userIds: ["bob"] },
    ]);
    toggle("❤️", 3);
    toggle("❤️", 4);
    expect(read().page[0].reactions).toEqual([
      { emoji: "👍", userIds: ["bob"] },
    ]);
  });

  test(`${getFunctionName(query)} rolls back one failed reaction while retaining another pending reaction`, () => {
    const { client, read, server, toggle, value } = setup(query);
    toggle("👍", 1);
    toggle("❤️", 2);
    client.ingestQueryResultsFromServer(server, new Set([1]));
    expect(read().page[0].reactions).toEqual([
      { emoji: "👍", userIds: ["bob"] },
      { emoji: "❤️", userIds: ["alice"] },
    ]);
    client.ingestQueryResultsFromServer(server, new Set([2]));
    expect(read()).toEqual(value);
  });

  test(`${getFunctionName(query)} replays pending changes over another user's update`, () => {
    const { client, read, server, toggle, value } = setup(query);
    toggle("👍", 1);
    const updatedServer = new Map(
      [...server].map(([token, result]) => [
        token,
        {
          ...result,
          result: {
            ...result.result,
            value: {
              ...value,
              page: [
                {
                  ...value.page[0],
                  reactions: [{ emoji: "👍", userIds: ["bob", "carol"] }],
                },
                value.page[1],
              ],
            },
          },
        },
      ])
    );
    client.ingestQueryResultsFromServer(updatedServer, new Set());
    expect(read().page[0].reactions).toEqual([
      { emoji: "👍", userIds: ["bob", "carol", "alice"] },
    ]);
  });
}
