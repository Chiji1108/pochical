import { insertAtPosition, useMutation } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";
import { ChatLoadingScreen } from "@/components/chat/chat-loading";
import { findChatReply } from "@/components/chat/chat-model";
import { ChatView } from "@/components/chat/chat-view";
import { useChatRead } from "@/components/chat/use-chat-read";
import { useCachedPaginatedQuery, useCachedQuery } from "@/lib/cached-query";
import { createDirectPresenceRoomId } from "@/lib/chat-presence";
import { useCurrentUserId } from "@/lib/work-data";
import { api as convexApi } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

const INITIAL_MESSAGE_COUNT = 40;
const INITIAL_EVENT_COUNT = 40;
const LOAD_MORE_MESSAGE_COUNT = 40;
const LOAD_MORE_EVENT_COUNT = 40;

const createOptimisticId = (prefix: string) =>
  `${prefix}:${Date.now()}:${Math.random()}`;

export default function DirectChat() {
  const router = useRouter();
  const { groupId, memberUserId } = useLocalSearchParams<{
    groupId: string;
    memberUserId: string;
  }>();
  const currentUserId = useCurrentUserId() ?? "";
  const targetGroupId = groupId as Id<"groups">;
  const group = useCachedQuery(
    convexApi.groups.getDetail,
    groupId && currentUserId ? { groupId: targetGroupId } : "skip"
  );
  const targetMember = group?.members.find(
    (member) => member.userId === memberUserId
  );
  const {
    isShowingCache: messagesCached,
    loadMore: loadMoreMessages,
    results: messages,
    status: messageStatus,
  } = useCachedPaginatedQuery(
    convexApi.chat.listDirectMessages,
    groupId && currentUserId && memberUserId
      ? {
          groupId: targetGroupId,

          targetUserId: memberUserId,
        }
      : "skip",
    { initialNumItems: INITIAL_MESSAGE_COUNT }
  );
  const {
    isShowingCache: eventsCached,
    loadMore: loadMoreEvents,
    results: events,
    status: eventStatus,
  } = useCachedPaginatedQuery(
    convexApi.groupEvents.listDirect,
    groupId && currentUserId && memberUserId
      ? {
          groupId: targetGroupId,

          targetUserId: memberUserId,
        }
      : "skip",
    { initialNumItems: INITIAL_EVENT_COUNT }
  );
  const sendMessageMutation = useMutation(
    convexApi.chat.sendDirectMessage
  ).withOptimisticUpdate((localQueryStore, args) => {
    const now = Date.now();
    const authorDisplayName = group?.ownDisplayName ?? "あなた";

    insertAtPosition({
      argsToMatch: {
        groupId: args.groupId,

        targetUserId: args.targetUserId,
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
        readCount: 0,
        reply: findChatReply(messages, args.replyToMessageId),
        threadId: createOptimisticId("thread") as Id<"chatThreads">,
      },
      localQueryStore,
      paginatedQuery: convexApi.chat.listDirectMessages,
      sortKeyFromItem: (message) => message.createdAt,
      sortOrder: "desc",
    });
  });
  const markReadMutation = useMutation(convexApi.chat.markDirectRead);

  const markRead = useCallback(async () => {
    await markReadMutation({
      groupId: targetGroupId,
      targetUserId: memberUserId,
    });
  }, [markReadMutation, targetGroupId, memberUserId]);
  const latestMessageId = messages.find(
    (message) => !message._id.startsWith("message:")
  )?._id;
  useChatRead(
    Boolean(
      groupId &&
        currentUserId &&
        memberUserId &&
        messageStatus !== "LoadingFirstPage"
    ),
    latestMessageId,
    markRead
  );

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(`/group?groupId=${groupId}`);
  };

  if (group === undefined) {
    return <ChatLoadingScreen onBack={goBack} />;
  }

  if (!(group && targetMember)) {
    router.replace(`/group?groupId=${groupId}`);
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
      messages={messages}
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
          targetUserId: targetMember.userId,
        });
      }}
      presenceMembers={group.members}
      presenceRoomId={createDirectPresenceRoomId(
        group._id,
        currentUserId,
        targetMember.userId
      )}
      readReceiptMode="direct"
      title={targetMember.displayName}
    />
  );
}
