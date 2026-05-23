import {
  insertAtPosition,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { Alert, View } from "react-native";
import { ChatView } from "@/components/chat/chat-view";
import { createGroupPresenceRoomId } from "@/lib/chat-presence";
import { useCurrentUserId } from "@/lib/instant";
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
  const group = useQuery(
    convexApi.groups.getDetail,
    groupId && currentUserId
      ? { groupId: targetGroupId, instantUserId: currentUserId }
      : "skip"
  );
  const {
    loadMore: loadMoreMessages,
    results: messages,
    status: messageStatus,
  } = usePaginatedQuery(
    convexApi.chat.listGroupMessages,
    groupId && currentUserId
      ? { groupId: targetGroupId, instantUserId: currentUserId }
      : "skip",
    { initialNumItems: INITIAL_MESSAGE_COUNT }
  );
  const {
    loadMore: loadMoreEvents,
    results: events,
    status: eventStatus,
  } = usePaginatedQuery(
    convexApi.groupEvents.listGroup,
    groupId && currentUserId
      ? { groupId: targetGroupId, instantUserId: currentUserId }
      : "skip",
    { initialNumItems: INITIAL_EVENT_COUNT }
  );
  const sendMessageMutation = useMutation(
    convexApi.chat.sendGroupMessage
  ).withOptimisticUpdate((localQueryStore, args) => {
    const now = Date.now();
    const authorDisplayName = group?.ownDisplayName ?? "あなた";

    insertAtPosition({
      argsToMatch: {
        groupId: args.groupId,
        instantUserId: args.instantUserId,
      },
      item: {
        _creationTime: now,
        _id: createOptimisticId("message") as Id<"chatMessages">,
        authorDisplayName,
        authorDisplayNameSnapshot: authorDisplayName,
        authorInstantUserId: args.instantUserId,
        body: args.body,
        createdAt: now,
        groupId: args.groupId,
        readCount: 0,
        threadId: createOptimisticId("thread") as Id<"chatThreads">,
      },
      localQueryStore,
      paginatedQuery: convexApi.chat.listGroupMessages,
      sortKeyFromItem: (message) => message.createdAt,
      sortOrder: "desc",
    });
  });
  const markReadMutation = useMutation(convexApi.chat.markGroupRead);

  useEffect(() => {
    if (!(groupId && currentUserId && messages.length > 0)) {
      return;
    }

    markReadMutation({
      groupId: targetGroupId,
      instantUserId: currentUserId,
    }).catch(() => undefined);
  }, [
    currentUserId,
    groupId,
    markReadMutation,
    messages.length,
    targetGroupId,
  ]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(groupId ? `/group?groupId=${groupId}` : "/group");
  };

  if (group === undefined) {
    return <View className="flex-1 bg-background" />;
  }

  if (!group) {
    router.replace("/group");
    return <View className="flex-1 bg-background" />;
  }

  return (
    <ChatView
      currentUserId={currentUserId}
      events={events}
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
      onSend={async (body) => {
        try {
          await sendMessageMutation({
            body,
            groupId: group._id,
            instantUserId: currentUserId,
          });
          await markReadMutation({
            groupId: group._id,
            instantUserId: currentUserId,
          });
        } catch (error) {
          Alert.alert(
            "送信できませんでした",
            error instanceof Error
              ? error.message
              : "時間をおいて再試行してください"
          );
          throw error;
        }
      }}
      presenceMembers={group.members}
      presenceRoomId={createGroupPresenceRoomId(group._id)}
      readReceiptMode="count"
      title={group.name}
    />
  );
}
