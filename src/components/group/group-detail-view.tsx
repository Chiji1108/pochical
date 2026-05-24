import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import {
  Button,
  Card,
  ListGroup,
  Separator,
  Text,
  useThemeColor,
} from "heroui-native";
import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type InviteDetails,
  InviteDialog,
} from "@/components/group/group-dialogs";
import { useCurrentUserId } from "@/lib/instant";
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

type GroupDetailHeaderAction = {
  accessibilityLabel: string;
  icon: SymbolViewProps["name"];
  onPress: () => void;
};

type GroupDetailHeaderProps = {
  includeTopInset?: boolean;
  leftAction?: GroupDetailHeaderAction;
  rightAction?: GroupDetailHeaderAction;
  title: string;
  titleAlign?: "center" | "left";
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
  const currentUserId = useCurrentUserId();
  const autoInviteShownGroupIdRef = useRef("");
  const [backgroundColor, dangerColor, dangerForegroundColor] = useThemeColor([
    "background",
    "danger",
    "danger-foreground",
  ]);
  const [inviteDetails, setInviteDetails] = useState<InviteDetails>();
  const group = useQuery(
    convexApi.groups.getDetail,
    groupId && currentUserId
      ? { groupId: groupId as Id<"groups">, instantUserId: currentUserId }
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
    return <View style={[styles.flex, { backgroundColor }]} />;
  }

  if (!group) {
    return (
      <View style={[styles.flex, { backgroundColor }]}>
        <GroupDetailHeader
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
                  onPress: onBack,
                }
              : undefined
          }
          title="グループ"
        />
        <View style={styles.centerState}>
          <Text color="muted" style={styles.centerStateText}>
            グループが見つかりません
          </Text>
        </View>
      </View>
    );
  }

  const directMembers = group.members
    .filter((member) => member.instantUserId !== currentUserId)
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
    <View style={[styles.flex, { backgroundColor }]}>
      <GroupDetailHeader
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
                onPress: onBack,
              }
            : undefined
        }
        rightAction={{
          accessibilityLabel: `${group.name}の設定を開く`,
          icon: {
            android: "settings",
            ios: "gearshape",
            web: "settings",
          },
          onPress: () => {
            router.push(`/share-groups/${group._id}/settings`);
          },
        }}
        title={group.name}
        titleAlign="left"
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.flex}
      >
        <View>
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
                dangerColor={dangerColor}
                dangerForegroundColor={dangerForegroundColor}
                latestAt={group.groupLastMessageCreatedAt}
                unreadCount={group.groupUnreadCount}
              />
            </ListGroup.Item>
          </ListGroup>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>個人チャット</Text>
          {directMembers.length > 0 ? (
            <ListGroup>
              {directMembers.map((member, index) => (
                <View key={member._id}>
                  <DirectChatListItem
                    dangerColor={dangerColor}
                    dangerForegroundColor={dangerForegroundColor}
                    member={member}
                    onOpen={() => {
                      router.push(
                        `/share-groups/${group._id}/chats/${encodeURIComponent(member.instantUserId)}`
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
              <Text color="muted" style={styles.emptyCardText}>
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

const GroupDetailHeaderActionButton: FC<{
  action?: GroupDetailHeaderAction;
}> = ({ action }) => (
  <View style={styles.headerActionSlot}>
    {action ? (
      <Button
        accessibilityLabel={action.accessibilityLabel}
        isIconOnly
        onPress={action.onPress}
        size="sm"
        style={styles.headerActionButton}
        variant="ghost"
      >
        <SymbolView name={action.icon} size={18} />
      </Button>
    ) : null}
  </View>
);

const GroupDetailHeader: FC<GroupDetailHeaderProps> = ({
  includeTopInset = true,
  leftAction,
  rightAction,
  title,
  titleAlign = "center",
}) => {
  const insets = useSafeAreaInsets();
  const isLeftAligned = titleAlign === "left";
  const [backgroundColor, borderColor] = useThemeColor([
    "background",
    "border",
  ]);

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor,
          borderColor,
          paddingTop: includeTopInset ? insets.top : 0,
        },
      ]}
    >
      <View style={styles.headerContent}>
        {isLeftAligned && !leftAction ? null : (
          <View
            style={
              isLeftAligned
                ? styles.headerLeftCompact
                : styles.headerSideExpanded
            }
          >
            <GroupDetailHeaderActionButton action={leftAction} />
          </View>
        )}
        <Text
          numberOfLines={1}
          style={[
            styles.headerTitle,
            isLeftAligned ? styles.leftHeaderTitle : styles.centerHeaderTitle,
          ]}
        >
          {title}
        </Text>
        <View
          style={
            isLeftAligned
              ? styles.headerRightCompact
              : styles.headerRightExpanded
          }
        >
          <GroupDetailHeaderActionButton action={rightAction} />
        </View>
      </View>
    </View>
  );
};

const DirectChatListItem = ({
  dangerColor,
  dangerForegroundColor,
  member,
  onOpen,
}: {
  dangerColor: string;
  dangerForegroundColor: string;
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
      dangerColor={dangerColor}
      dangerForegroundColor={dangerForegroundColor}
      latestAt={member.lastMessageCreatedAt}
      unreadCount={member.unreadCount}
    />
  </ListGroup.Item>
);

const ChatItemSuffix = ({
  dangerColor,
  dangerForegroundColor,
  latestAt,
  unreadCount,
}: {
  dangerColor: string;
  dangerForegroundColor: string;
  latestAt?: number;
  unreadCount: number;
}) => {
  const latestTime = formatLatestMessageTime(latestAt);

  return (
    <ListGroup.ItemSuffix>
      <View style={styles.chatSuffix}>
        <View style={styles.chatSuffixContent}>
          {unreadCount > 0 ? (
            <View style={styles.chatUnreadBadgeSlot}>
              <UnreadBadge
                color={dangerColor}
                count={unreadCount}
                foregroundColor={dangerForegroundColor}
              />
            </View>
          ) : null}
          {latestTime ? (
            <Text
              color="muted"
              style={[
                styles.latestTime,
                unreadCount > 0 ? styles.latestTimeBelowBadge : null,
              ]}
            >
              {latestTime}
            </Text>
          ) : null}
        </View>
        <ListGroup.ItemSuffix />
      </View>
    </ListGroup.ItemSuffix>
  );
};

const UnreadBadge = ({
  color,
  count,
  foregroundColor,
}: {
  color: string;
  count: number;
  foregroundColor: string;
}) => (
  <View style={[styles.unreadBadge, { backgroundColor: color }]}>
    <Text style={[styles.unreadBadgeText, { color: foregroundColor }]}>
      {count > 99 ? "99+" : count}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  centerHeaderTitle: {
    textAlign: "center",
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  centerStateText: {
    fontSize: 16,
    textAlign: "center",
  },
  chatSuffix: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  chatSuffixContent: {
    alignItems: "flex-end",
    height: 44,
    minWidth: 40,
    position: "relative",
  },
  chatUnreadBadgeSlot: {
    position: "absolute",
    right: 0,
    top: 0,
  },
  emptyCardText: {
    fontSize: 14,
  },
  flex: {
    flex: 1,
  },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerActionButton: {
    height: 40,
    width: 40,
  },
  headerActionSlot: {
    height: 40,
    width: 40,
  },
  headerContent: {
    alignItems: "center",
    flexDirection: "row",
    height: 56,
    paddingHorizontal: 12,
  },
  headerLeftCompact: {
    alignItems: "flex-start",
  },
  headerRightCompact: {
    alignItems: "flex-end",
  },
  headerRightExpanded: {
    alignItems: "flex-end",
    flex: 1,
    minWidth: 80,
  },
  headerSideExpanded: {
    alignItems: "flex-start",
    flex: 1,
    minWidth: 80,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    minWidth: 0,
    paddingHorizontal: 12,
  },
  latestTime: {
    position: "absolute",
    right: 0,
    top: 0,
    fontSize: 11,
  },
  latestTimeBelowBadge: {
    bottom: 0,
    top: "auto",
  },
  leftHeaderTitle: {
    flex: 1,
    textAlign: "left",
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  unreadBadge: {
    alignItems: "center",
    borderRadius: 999,
    height: 20,
    justifyContent: "center",
    minWidth: 20,
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    includeFontPadding: false,
    lineHeight: 13,
    textAlign: "center",
  },
});
