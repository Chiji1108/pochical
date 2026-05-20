import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Card, ListGroup, Separator, Text } from "heroui-native";
import { useSession } from "jazz-tools/react-native";
import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import {
  type InviteDetails,
  InviteDialog,
} from "@/components/group/group-dialogs";
import { AppHeader } from "@/components/navigation/app-header";
import { api as convexApi } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type GroupDetail = NonNullable<
  FunctionReturnType<typeof convexApi.groups.getDetail>
>;

type GroupMember = GroupDetail["members"][number];

type GroupDetailViewProps = {
  groupId?: string;
  isEmbedded?: boolean;
  onBack?: () => void;
  onAutoInviteShown?: () => void;
  showInvite?: boolean;
};

const dateKeyFormatter = new Intl.DateTimeFormat("ja-JP", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const latestDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  day: "numeric",
  month: "numeric",
});

const latestTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
});

const formatLatestMessageTime = (timestamp?: number) => {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  const today = new Date();

  if (dateKeyFormatter.format(date) === dateKeyFormatter.format(today)) {
    return latestTimeFormatter.format(date);
  }

  return latestDateFormatter.format(date);
};

export const GroupDetailView = ({
  groupId,
  isEmbedded = false,
  onBack,
  onAutoInviteShown,
  showInvite = false,
}: GroupDetailViewProps) => {
  const router = useRouter();
  const session = useSession();
  const currentUserId = session?.user_id ?? "";
  const autoInviteShownGroupIdRef = useRef("");
  const [inviteDetails, setInviteDetails] = useState<InviteDetails>();
  const group = useQuery(
    convexApi.groups.getDetail,
    groupId && currentUserId
      ? { groupId: groupId as Id<"groups">, jazzUserId: currentUserId }
      : "skip"
  );

  useEffect(() => {
    if (!(group && showInvite)) {
      return;
    }

    if (autoInviteShownGroupIdRef.current === group._id) {
      return;
    }

    autoInviteShownGroupIdRef.current = group._id;
    setInviteDetails({
      groupEmoji: group.emoji,
      groupName: group.name,
      url: group.inviteUrl,
    });
    onAutoInviteShown?.();
  }, [group, onAutoInviteShown, showInvite]);

  if (!groupId || group === undefined) {
    return <View className="flex-1 bg-background" />;
  }

  if (!group) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader
          includeTopInset={!isEmbedded}
          leftAction={
            onBack
              ? {
                  accessibilityLabel: "グループに戻る",
                  icon: {
                    android: "arrow_back",
                    ios: "chevron.left",
                    web: "arrow_back",
                  },
                  label: "戻る",
                  onPress: onBack,
                }
              : undefined
          }
          title="グループ"
        />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-base" color="muted">
            グループが見つかりません
          </Text>
        </View>
      </View>
    );
  }

  const directMembers = group.members
    .filter((member) => member.jazzUserId !== currentUserId)
    .sort((firstMember, secondMember) => {
      const unreadDifference =
        Number(secondMember.unreadCount > 0) -
        Number(firstMember.unreadCount > 0);

      if (unreadDifference !== 0) {
        return unreadDifference;
      }

      const latestMessageDifference =
        (secondMember.lastMessageCreatedAt ?? 0) -
        (firstMember.lastMessageCreatedAt ?? 0);

      if (latestMessageDifference !== 0) {
        return latestMessageDifference;
      }

      return firstMember.displayName.localeCompare(
        secondMember.displayName,
        "ja"
      );
    });

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        includeTopInset={!isEmbedded}
        leftAction={
          onBack
            ? {
                accessibilityLabel: "グループ一覧に戻る",
                icon: {
                  android: "arrow_back",
                  ios: "chevron.left",
                  web: "arrow_back",
                },
                label: "戻る",
                onPress: onBack,
              }
            : undefined
        }
        rightActions={[
          {
            accessibilityLabel: `${group.name}の設定を開く`,
            icon: {
              android: "settings",
              ios: "gearshape",
              web: "settings",
            },
            onPress: () => {
              router.push(`/share-groups/${group._id}/settings`);
            },
          },
        ]}
        title={group.name}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          gap: 16,
          paddingBottom: 24,
          paddingHorizontal: 16,
          paddingTop: 16,
        }}
      >
        <View className="gap-3">
          <Text className="font-semibold text-lg">グループ</Text>
          <ListGroup>
            <ListGroup.Item
              accessibilityLabel={`${group.name}のシフト表を開く`}
              onPress={() => {
                router.push(`/share-groups/${group._id}/shifts`);
              }}
            >
              <ListGroup.ItemPrefix>
                <SymbolView
                  name={{
                    android: "calendar_month",
                    ios: "calendar",
                    web: "calendar_month",
                  }}
                  size={20}
                />
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle numberOfLines={1}>
                  シフト表
                </ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix />
            </ListGroup.Item>
            <Separator className="mx-4" />
            <ListGroup.Item
              accessibilityLabel={`${group.name}の全体チャットを開く`}
              onPress={() => {
                router.push(`/share-groups/${group._id}/chats/group`);
              }}
            >
              <ListGroup.ItemPrefix>
                <SymbolView
                  name={{
                    android: "forum",
                    ios: "bubble.left.and.bubble.right",
                    web: "forum",
                  }}
                  size={20}
                />
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle numberOfLines={1}>
                  全体チャット
                </ListGroup.ItemTitle>
                {group.groupLastMessagePreview ? (
                  <ListGroup.ItemDescription numberOfLines={1}>
                    {group.groupLastMessagePreview}
                  </ListGroup.ItemDescription>
                ) : null}
              </ListGroup.ItemContent>
              <ChatItemSuffix
                latestAt={group.groupLastMessageCreatedAt}
                unreadCount={group.groupUnreadCount}
              />
            </ListGroup.Item>
          </ListGroup>
        </View>
        <View className="gap-3">
          <Text className="font-semibold text-lg">個人チャット</Text>
          {directMembers.length > 0 ? (
            <ListGroup>
              {directMembers.map((member, index) => (
                <View key={member._id}>
                  <DirectChatListItem
                    member={member}
                    onOpen={() => {
                      router.push(
                        `/share-groups/${group._id}/chats/${encodeURIComponent(member.jazzUserId)}`
                      );
                    }}
                  />
                  {index < directMembers.length - 1 ? (
                    <Separator className="mx-4" />
                  ) : null}
                </View>
              ))}
            </ListGroup>
          ) : (
            <Card className="p-4">
              <Text className="text-sm" color="muted">
                個人チャットできるメンバーがいません
              </Text>
            </Card>
          )}
        </View>
      </ScrollView>
      <InviteDialog
        inviteDetails={inviteDetails}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setInviteDetails(undefined);
          }
        }}
      />
    </View>
  );
};

const DirectChatListItem = ({
  member,
  onOpen,
}: {
  member: GroupMember;
  onOpen: () => void;
}) => (
  <ListGroup.Item
    accessibilityLabel={`${member.displayName}さんとのチャットを開く`}
    onPress={onOpen}
  >
    <ListGroup.ItemPrefix>
      <SymbolView
        name={{ android: "chat_bubble", ios: "message", web: "chat" }}
        size={20}
      />
    </ListGroup.ItemPrefix>
    <ListGroup.ItemContent>
      <ListGroup.ItemTitle numberOfLines={1}>
        {member.displayName}
      </ListGroup.ItemTitle>
      {member.lastMessagePreview ? (
        <ListGroup.ItemDescription numberOfLines={1}>
          {member.lastMessagePreview}
        </ListGroup.ItemDescription>
      ) : null}
    </ListGroup.ItemContent>
    <ChatItemSuffix
      latestAt={member.lastMessageCreatedAt}
      unreadCount={member.unreadCount}
    />
  </ListGroup.Item>
);

const ChatItemSuffix = ({
  latestAt,
  unreadCount,
}: {
  latestAt?: number;
  unreadCount: number;
}) => {
  const latestTime = formatLatestMessageTime(latestAt);

  return (
    <ListGroup.ItemSuffix>
      <View className="flex-row items-center gap-2">
        <View className="min-w-10 items-end gap-1">
          {unreadCount > 0 ? <UnreadBadge count={unreadCount} /> : null}
          {latestTime ? (
            <Text className="text-[11px]" color="muted">
              {latestTime}
            </Text>
          ) : null}
        </View>
        <ListGroup.ItemSuffix />
      </View>
    </ListGroup.ItemSuffix>
  );
};

const UnreadBadge = ({ count }: { count: number }) => (
  <View className="min-w-5 items-center rounded-full bg-danger px-1.5 py-0.5">
    <Text className="font-semibold text-[11px] text-danger-foreground">
      {count > 99 ? "99+" : count}
    </Text>
  </View>
);
