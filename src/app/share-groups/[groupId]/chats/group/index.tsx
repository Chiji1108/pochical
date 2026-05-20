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
import { api as convexApi } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

const INITIAL_MESSAGE_COUNT = 40;
const LOAD_MORE_MESSAGE_COUNT = 40;

const createOptimisticId = (prefix: string) =>
  `${prefix}:${Date.now()}:${Math.random()}`;

export default function GroupChat() {
  const router = useRouter();
  const session = useSession();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const currentUserId = session?.user_id ?? "";
  const targetGroupId = groupId as Id<"groups">;
  const group = useQuery(
    convexApi.groups.getDetail,
    groupId && currentUserId
      ? { groupId: targetGroupId, jazzUserId: currentUserId }
      : "skip"
  );
  const { loadMore, results, status } = usePaginatedQuery(
    convexApi.chat.listGroupMessages,
    groupId && currentUserId
      ? { groupId: targetGroupId, jazzUserId: currentUserId }
      : "skip",
    { initialNumItems: INITIAL_MESSAGE_COUNT }
  );
  const sendMessageMutation = useMutation(
    convexApi.chat.sendGroupMessage
  ).withOptimisticUpdate((localQueryStore, args) => {
    const now = Date.now();
    const authorDisplayName = group?.ownDisplayName ?? "あなた";

    insertAtPosition({
      argsToMatch: {
        groupId: args.groupId,
        jazzUserId: args.jazzUserId,
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
      paginatedQuery: convexApi.chat.listGroupMessages,
      sortKeyFromItem: (message) => message.createdAt,
      sortOrder: "desc",
    });
  });
  const markReadMutation = useMutation(convexApi.chat.markGroupRead);

  useEffect(() => {
    if (!(groupId && currentUserId && results.length > 0)) {
      return;
    }

    markReadMutation({
      groupId: targetGroupId,
      jazzUserId: currentUserId,
    }).catch(() => undefined);
  }, [currentUserId, groupId, markReadMutation, results.length, targetGroupId]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(groupId ? `/share-groups/${groupId}` : "/group");
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
      isLoadingMore={status === "LoadingMore"}
      messages={results}
      onBack={goBack}
      onLoadMore={() => {
        if (status === "CanLoadMore") {
          loadMore(LOAD_MORE_MESSAGE_COUNT);
        }
      }}
      onSend={async (body) => {
        try {
          await sendMessageMutation({
            body,
            groupId: group._id,
            jazzUserId: currentUserId,
          });
          await markReadMutation({
            groupId: group._id,
            jazzUserId: currentUserId,
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
      readReceiptMode="count"
      title={group.name}
    />
  );
}
