import {
  insertAtPosition,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSession } from "jazz-tools/react-native";
import { useEffect } from "react";
import { Alert, View } from "react-native";
import { ChatView } from "@/components/chat/chat-view";
import { createDirectPresenceRoomId } from "@/lib/chat-presence";
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
  const session = useSession();
  const { groupId, memberJazzUserId } = useLocalSearchParams<{
    groupId: string;
    memberJazzUserId: string;
  }>();
  const currentUserId = session?.user_id ?? "";
  const targetGroupId = groupId as Id<"groups">;
  const group = useQuery(
    convexApi.groups.getDetail,
    groupId && currentUserId
      ? { groupId: targetGroupId, jazzUserId: currentUserId }
      : "skip"
  );
  const targetMember = group?.members.find(
    (member) => member.jazzUserId === memberJazzUserId
  );
  const {
    loadMore: loadMoreMessages,
    results: messages,
    status: messageStatus,
  } = usePaginatedQuery(
    convexApi.chat.listDirectMessages,
    groupId && currentUserId && memberJazzUserId
      ? {
          groupId: targetGroupId,
          jazzUserId: currentUserId,
          targetJazzUserId: memberJazzUserId,
        }
      : "skip",
    { initialNumItems: INITIAL_MESSAGE_COUNT }
  );
  const {
    loadMore: loadMoreEvents,
    results: events,
    status: eventStatus,
  } = usePaginatedQuery(
    convexApi.groupEvents.listDirect,
    groupId && currentUserId && memberJazzUserId
      ? {
          groupId: targetGroupId,
          jazzUserId: currentUserId,
          targetJazzUserId: memberJazzUserId,
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
        jazzUserId: args.jazzUserId,
        targetJazzUserId: args.targetJazzUserId,
      },
      item: {
        _creationTime: now,
        _id: createOptimisticId("message") as Id<"chatMessages">,
        authorDisplayName,
        authorDisplayNameSnapshot: authorDisplayName,
        authorJazzUserId: args.jazzUserId,
        body: args.body,
        createdAt: now,
        groupId: args.groupId,
        readCount: 0,
        threadId: createOptimisticId("thread") as Id<"chatThreads">,
      },
      localQueryStore,
      paginatedQuery: convexApi.chat.listDirectMessages,
      sortKeyFromItem: (message) => message.createdAt,
      sortOrder: "desc",
    });
  });
  const markReadMutation = useMutation(convexApi.chat.markDirectRead);

  useEffect(() => {
    if (
      !(groupId && currentUserId && memberJazzUserId && messages.length > 0)
    ) {
      return;
    }

    markReadMutation({
      groupId: targetGroupId,
      jazzUserId: currentUserId,
      targetJazzUserId: memberJazzUserId,
    }).catch(() => undefined);
  }, [
    currentUserId,
    groupId,
    markReadMutation,
    memberJazzUserId,
    messages.length,
    targetGroupId,
  ]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(`/group?groupId=${groupId}`);
  };

  if (group === undefined) {
    return <View className="flex-1 bg-background" />;
  }

  if (!(group && targetMember)) {
    router.replace(`/group?groupId=${groupId}`);
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
            jazzUserId: currentUserId,
            targetJazzUserId: targetMember.jazzUserId,
          });
          await markReadMutation({
            groupId: group._id,
            jazzUserId: currentUserId,
            targetJazzUserId: targetMember.jazzUserId,
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
      presenceRoomId={createDirectPresenceRoomId(
        group._id,
        currentUserId,
        targetMember.jazzUserId
      )}
      readReceiptMode="direct"
      title={targetMember.displayName}
    />
  );
}
