import { insertAtPosition, useMutation } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { ChatLoadingScreen } from "@/components/chat/chat-loading";
import { findChatReply, withReadCounts } from "@/components/chat/chat-model";
import { ChatView } from "@/components/chat/chat-view";
import { useChatRead } from "@/components/chat/use-chat-read";
import { useCachedPaginatedQuery, useCachedQuery } from "@/lib/cached-query";
import { createGroupPresenceRoomId } from "@/lib/chat-presence";
import { useCurrentUserId } from "@/lib/work-data";
import { api as convexApi } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

const INITIAL_MESSAGE_COUNT = 40;
const INITIAL_EVENT_COUNT = 40;
const LOAD_MORE_MESSAGE_COUNT = 40;
const LOAD_MORE_EVENT_COUNT = 40;

const createOptimisticId = (prefix: string) =>
  `${prefix}:${Date.now()}:${Math.random()}`;

export default function GroupChat() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const currentUserId = useCurrentUserId() ?? "";
  const targetGroupId = groupId as Id<"groups">;
  const group = useCachedQuery(
    convexApi.groups.getDetail,
    groupId && currentUserId ? { groupId: targetGroupId } : "skip"
  );
  const {
    isShowingCache: messagesCached,
    loadMore: loadMoreMessages,
    results: messages,
    status: messageStatus,
  } = useCachedPaginatedQuery(
    convexApi.chat.listGroupMessages,
    groupId && currentUserId ? { groupId: targetGroupId } : "skip",
    { initialNumItems: INITIAL_MESSAGE_COUNT }
  );
  const {
    isShowingCache: eventsCached,
    loadMore: loadMoreEvents,
    results: events,
    status: eventStatus,
  } = useCachedPaginatedQuery(
    convexApi.groupEvents.listGroup,
    groupId && currentUserId ? { groupId: targetGroupId } : "skip",
    { initialNumItems: INITIAL_EVENT_COUNT }
  );
  const readStates = useCachedQuery(
    convexApi.chat.listGroupReadStates,
    groupId && currentUserId ? { groupId: targetGroupId } : "skip"
  );
  const messagesWithReadCounts = useMemo(
    () => withReadCounts(messages, readStates ?? []),
    [messages, readStates]
  );
  const sendMessageMutation = useMutation(
    convexApi.chat.sendGroupMessage
  ).withOptimisticUpdate((localQueryStore, args) => {
    const now = Date.now();
    const authorDisplayName = group?.ownDisplayName ?? "あなた";

    insertAtPosition({
      argsToMatch: {
        groupId: args.groupId,
      },
      item: {
        _creationTime: now,
        _id: createOptimisticId("message") as Id<"chatMessages">,
        authorDisplayName,
        authorDisplayNameSnapshot: authorDisplayName,
        authorUserId: currentUserId ?? "",
        body: args.body,
        createdAt: now,
        groupId: args.groupId,
        reply: findChatReply(messages, args.replyToMessageId),
        threadId: createOptimisticId("thread") as Id<"chatThreads">,
      },
      localQueryStore,
      paginatedQuery: convexApi.chat.listGroupMessages,
      sortKeyFromItem: (message) => message.createdAt,
      sortOrder: "desc",
    });
  });
  const markReadMutation = useMutation(convexApi.chat.markGroupRead);

  const markRead = useCallback(async () => {
    await markReadMutation({ groupId: targetGroupId });
  }, [markReadMutation, targetGroupId]);
  const latestMessageId = messages.find(
    (message) => !message._id.startsWith("message:")
  )?._id;
  useChatRead(
    Boolean(groupId && currentUserId && messageStatus !== "LoadingFirstPage"),
    latestMessageId,
    markRead
  );

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(groupId ? `/group?groupId=${groupId}` : "/group");
  };

  if (group === undefined) {
    return <ChatLoadingScreen onBack={goBack} />;
  }

  if (!group) {
    router.replace("/group");
    return <View className="flex-1 bg-background" />;
  }

  return (
    <ChatView
      canLoadMore={
        messageStatus === "CanLoadMore" || eventStatus === "CanLoadMore"
      }
      currentUserId={currentUserId}
      events={events}
      isLoadingInitial={
        !(messagesCached || eventsCached) &&
        (messageStatus === "LoadingFirstPage" ||
          eventStatus === "LoadingFirstPage")
      }
      isLoadingMore={
        messageStatus === "LoadingMore" || eventStatus === "LoadingMore"
      }
      messages={messagesWithReadCounts}
      onBack={goBack}
      onLoadMore={() => {
        if (messageStatus === "CanLoadMore") {
          loadMoreMessages(LOAD_MORE_MESSAGE_COUNT);
        }
        if (eventStatus === "CanLoadMore") {
          loadMoreEvents(LOAD_MORE_EVENT_COUNT);
        }
      }}
      onSend={async (body, replyToMessageId) => {
        await sendMessageMutation({
          body,
          replyToMessageId,
          groupId: group._id,
        });
      }}
      presenceMembers={group.members}
      presenceRoomId={createGroupPresenceRoomId(group._id)}
      readReceiptMode="count"
      title={group.name}
    />
  );
}
