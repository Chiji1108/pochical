import { usePresence } from "@convex-dev/presence/react-native";
import { FlashList } from "@shopify/flash-list";
import { useMutation, useQuery } from "convex/react";
import { setStringAsync } from "expo-clipboard";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import {
  Button,
  Popover,
  type PopoverTriggerRef,
  Text,
  useThemeColor,
  useToast,
} from "heroui-native";
import type { ElementRef, ReactNode, Ref } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  type ScrollViewProps,
  TextInput,
  View,
} from "react-native";
import {
  KeyboardChatScrollView,
  type KeyboardChatScrollViewProps,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AppHeader,
  type AppHeaderAction,
} from "@/components/navigation/app-header";
import type { ChatPresenceMember, ChatPresenceUser } from "@/lib/chat-presence";
import { getInviteCodeFromInviteUrl } from "@/lib/invite-links";
import { api as convexApi } from "../../../convex/_generated/api";
import { LinkifiedText } from "../common/linkified-text";

type ChatScrollViewRef = ElementRef<typeof KeyboardChatScrollView>;
type ChatScrollViewProps = KeyboardChatScrollViewProps & ScrollViewProps;

const ChatScrollView = ({
  ref,
  ...props
}: ChatScrollViewProps & { ref?: Ref<ChatScrollViewRef> }) => (
  <KeyboardChatScrollView keyboardLiftBehavior="always" ref={ref} {...props} />
);

export type ChatMessage = {
  _id: string;
  authorDisplayName: string;
  authorInstantUserId: string;
  body: string;
  createdAt: number;
  readCount: number;
};

export type ChatEvent = {
  _id: string;
  actorDisplayNameSnapshot: string;
  actorInstantUserId: string;
  body: string;
  createdAt: number;
  kind:
    | "group_name_updated"
    | "group_emoji_updated"
    | "display_name_updated"
    | "invite_code_regenerated"
    | "member_joined"
    | "member_left"
    | "member_removed";
  nextValue?: string;
  previousValue?: string;
  targetDisplayNameSnapshot?: string;
  targetInstantUserId?: string;
};

type ChatTimelineItem =
  | {
      createdAt: number;
      event: ChatEvent;
      id: string;
      type: "event";
    }
  | {
      createdAt: number;
      id: string;
      message: ChatMessage;
      type: "message";
    };

type ChatListItem =
  | {
      message: ChatMessage;
      showAuthor: boolean;
      type: "message";
    }
  | {
      event: ChatEvent;
      type: "event";
    }
  | {
      date: string;
      key: string;
      type: "date";
    };

type ChatViewProps = {
  currentUserId: string;
  events?: ChatEvent[];
  isLoadingMore: boolean;
  messages: ChatMessage[];
  onBack: () => void;
  onLoadMore: () => void;
  onSend: (body: string) => Promise<void>;
  presenceMembers: ChatPresenceMember[];
  presenceRoomId: string;
  readReceiptMode: "count" | "direct";
  rightActions?: AppHeaderAction[];
  title: string;
  topContent?: ReactNode;
};

type PresenceStateWithData = {
  data?: unknown;
  lastDisconnected: number;
  online: boolean;
  userId: string;
};

const isTypingPresenceData = (data: unknown) =>
  typeof data === "object" &&
  data !== null &&
  "isTyping" in data &&
  (data as { isTyping?: unknown }).isTyping === true;

const messageTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
});

const dateBadgeFormatter = new Intl.DateTimeFormat("ja-JP", {
  day: "numeric",
  month: "long",
  weekday: "short",
  year: "numeric",
});

const currentYearDateBadgeFormatter = new Intl.DateTimeFormat("ja-JP", {
  day: "numeric",
  month: "long",
  weekday: "short",
});

const dateKeyFormatter = new Intl.DateTimeFormat("sv-SE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const urlRegex = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const trailingPunctuationRegex = /[),.。、]+$/;
const optimisticMessageIdPrefix = "message:";

const getStartOfDay = (date: Date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  return startOfDay;
};

const formatDateBadge = (date: Date) => {
  const today = getStartOfDay(new Date());
  const targetDate = getStartOfDay(date);
  const dayDifference = Math.round(
    (today.getTime() - targetDate.getTime()) / 86_400_000
  );

  if (dayDifference === 0) {
    return "今日";
  }

  if (dayDifference === 1) {
    return "昨日";
  }

  if (dayDifference === 2) {
    return "一昨日";
  }

  return today.getFullYear() === targetDate.getFullYear()
    ? currentYearDateBadgeFormatter.format(targetDate)
    : dateBadgeFormatter.format(targetDate);
};

const buildTimelineItems = (
  messages: ChatMessage[],
  events: ChatEvent[]
): ChatTimelineItem[] =>
  [
    ...messages.map((message) => ({
      createdAt: message.createdAt,
      id: message._id,
      message,
      type: "message" as const,
    })),
    ...events.map((event) => ({
      createdAt: event.createdAt,
      event,
      id: event._id,
      type: "event" as const,
    })),
  ].sort((firstItem, secondItem) => {
    const createdAtDifference = secondItem.createdAt - firstItem.createdAt;

    if (createdAtDifference !== 0) {
      return createdAtDifference;
    }

    return firstItem.id.localeCompare(secondItem.id);
  });

const buildChatListItems = (
  messages: ChatMessage[],
  events: ChatEvent[]
): ChatListItem[] => {
  const timelineItems = buildTimelineItems(messages, events);
  const items: ChatListItem[] = [];

  for (let index = 0; index < timelineItems.length; index += 1) {
    const timelineItem = timelineItems[index];
    const currentDateKey = dateKeyFormatter.format(
      new Date(timelineItem.createdAt)
    );
    const nextTimelineItem = timelineItems[index + 1];
    const nextItemDateKey = nextTimelineItem
      ? dateKeyFormatter.format(new Date(nextTimelineItem.createdAt))
      : null;

    if (timelineItem.type === "message") {
      const showAuthor =
        nextTimelineItem?.type !== "message" ||
        nextTimelineItem.message.authorInstantUserId !==
          timelineItem.message.authorInstantUserId ||
        nextItemDateKey !== currentDateKey;

      items.push({
        message: timelineItem.message,
        showAuthor,
        type: "message",
      });
    } else {
      items.push({ event: timelineItem.event, type: "event" });
    }

    if (!nextTimelineItem || nextItemDateKey !== currentDateKey) {
      const itemDate = new Date(timelineItem.createdAt);

      items.push({
        date: formatDateBadge(itemDate),
        key: currentDateKey,
        type: "date",
      });
    }
  }

  return items;
};

const normalizeUrl = (url: string) =>
  url.startsWith("www.") ? `https://${url}` : url;

const getInviteCodeFromText = (text: string) => {
  for (const match of text.matchAll(urlRegex)) {
    const rawUrl = match[0].replace(trailingPunctuationRegex, "");
    const inviteCode = getInviteCodeFromInviteUrl(normalizeUrl(rawUrl));

    if (inviteCode) {
      return inviteCode;
    }
  }
};

const copyMessageBody = async (body: string) => {
  await setStringAsync(body);
};

const getChatListItemKey = (item: ChatListItem) => {
  if (item.type === "message") {
    return item.message._id;
  }

  if (item.type === "event") {
    return item.event._id;
  }

  return item.key;
};

const getTypingSummary = (typingUsers: ChatPresenceUser[]) => {
  if (typingUsers.length === 0) {
    return null;
  }

  if (typingUsers.length === 1) {
    return `${typingUsers[0].displayName}さんが入力中...`;
  }

  return `${typingUsers.length}人が入力中...`;
};

export const ChatView = ({
  currentUserId,
  events = [],
  isLoadingMore,
  messages,
  onBack,
  onLoadMore,
  onSend,
  presenceMembers,
  presenceRoomId,
  readReceiptMode,
  rightActions,
  title,
  topContent,
}: ChatViewProps) => {
  const [accentColor, fieldForegroundColor, fieldPlaceholderColor] =
    useThemeColor(["accent", "field-foreground", "field-placeholder"]);
  const insets = useSafeAreaInsets();
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const trimmedBody = body.trim();
  const isTyping = trimmedBody.length > 0;
  const isSendDisabled = isSending || !trimmedBody;
  const presenceState = usePresence(
    convexApi.presence,
    presenceRoomId,
    currentUserId
  );
  const updateTypingMutation = useMutation(convexApi.presence.updateTyping);
  const listItems = useMemo(
    () => buildChatListItems(messages, events),
    [events, messages]
  );
  const visibleListItems = useMemo(() => [...listItems].reverse(), [listItems]);
  const presenceUsers = useMemo(() => {
    const membersByInstantUserId = new Map(
      presenceMembers.map((member) => [member.instantUserId, member])
    );
    const states = (presenceState ?? []) as PresenceStateWithData[];
    const users: ChatPresenceUser[] = [];

    for (const state of states) {
      if (state.userId === currentUserId || !state.online) {
        continue;
      }

      const member = membersByInstantUserId.get(state.userId);

      if (!member) {
        continue;
      }

      users.push({
        ...member,
        isTyping: isTypingPresenceData(state.data),
        online: state.online,
      });
    }

    return users;
  }, [currentUserId, presenceMembers, presenceState]);
  const typingUsers = presenceUsers.filter((user) => user.isTyping);
  const typingSummary = getTypingSummary(typingUsers);

  useEffect(() => {
    updateTypingMutation({
      isTyping,
      roomId: presenceRoomId,
      userId: currentUserId,
    }).catch(() => undefined);

    return () => {
      if (isTyping) {
        updateTypingMutation({
          isTyping: false,
          roomId: presenceRoomId,
          userId: currentUserId,
        }).catch(() => undefined);
      }
    };
  }, [currentUserId, isTyping, presenceRoomId, updateTypingMutation]);

  const sendMessage = async () => {
    if (isSendDisabled) {
      return;
    }

    const messageBody = trimmedBody;
    setBody("");
    updateTypingMutation({
      isTyping: false,
      roomId: presenceRoomId,
      userId: currentUserId,
    }).catch(() => undefined);
    setIsSending(true);

    try {
      await onSend(messageBody);
    } catch {
      setBody(messageBody);
    } finally {
      setIsSending(false);
    }
  };

  const renderListItem = ({ item }: { item: ChatListItem }) => {
    let content: ReactNode;

    if (item.type === "date") {
      content = <DateBadge date={item.date} />;
    } else if (item.type === "event") {
      content = <EventRow currentUserId={currentUserId} event={item.event} />;
    } else {
      content = (
        <MessageBubble
          isOwnMessage={item.message.authorInstantUserId === currentUserId}
          message={item.message}
          readReceiptMode={readReceiptMode}
          showAuthor={item.showAuthor}
        />
      );
    }

    return <View className="mt-1.5">{content}</View>;
  };
  const renderChatScrollComponent = useCallback(
    (props: ScrollViewProps) => <ChatScrollView {...props} />,
    []
  );

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        leftAction={{
          accessibilityLabel: "戻る",
          icon: {
            android: "arrow_back",
            ios: "chevron.left",
            web: "arrow_back",
          },
          label: "戻る",
          onPress: onBack,
        }}
        rightActions={rightActions}
        title={title}
      />
      {topContent}
      <FlashList
        className="flex-1"
        contentContainerClassName="px-4 py-3"
        data={visibleListItems}
        drawDistance={1200}
        keyExtractor={getChatListItemKey}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center px-6 py-12">
            <Text className="text-center text-base" color="muted">
              まだメッセージがありません
            </Text>
          </View>
        }
        maintainVisibleContentPosition={{
          autoscrollToBottomThreshold: 0.2,
          startRenderingFromBottom: true,
        }}
        onStartReached={() => {
          if (!isLoadingMore) {
            onLoadMore();
          }
        }}
        onStartReachedThreshold={0.4}
        renderItem={renderListItem}
        renderScrollComponent={renderChatScrollComponent}
      />
      <TypingIndicator label={typingSummary} />
      <KeyboardStickyView
        className="border-border border-t bg-background px-3 pt-2"
        offset={{ closed: 0, opened: 0 }}
        style={{ paddingBottom: Math.max(12, insets.bottom + 8) }}
      >
        <View className="flex-row items-end">
          <View className="relative flex-1">
            <TextInput
              accessibilityLabel="メッセージ"
              className="max-h-32 min-h-10 w-full rounded-lg border border-border bg-content1 py-2 pr-12 pl-3 text-base"
              enablesReturnKeyAutomatically={true}
              multiline={true}
              onChangeText={setBody}
              onSubmitEditing={() => {
                sendMessage().catch(() => undefined);
              }}
              placeholder="メッセージ"
              placeholderTextColor={fieldPlaceholderColor}
              returnKeyType="send"
              style={{ color: fieldForegroundColor }}
              submitBehavior="submit"
              value={body}
            />
            <View
              className="absolute"
              pointerEvents="box-none"
              style={{ bottom: 4, right: 4 }}
            >
              <Button
                accessibilityLabel="メッセージを送信"
                className="h-8 w-8 rounded-full"
                isDisabled={isSendDisabled}
                isIconOnly={true}
                onPress={sendMessage}
                size="sm"
                variant="ghost"
              >
                <SymbolView
                  name={{
                    android: "send",
                    ios: "paperplane.fill",
                    web: "send",
                  }}
                  size={15}
                  tintColor={
                    isSendDisabled ? fieldPlaceholderColor : accentColor
                  }
                />
              </Button>
            </View>
          </View>
        </View>
      </KeyboardStickyView>
    </View>
  );
};

const formatEventActor = (event: ChatEvent, currentUserId: string) =>
  event.actorInstantUserId === currentUserId
    ? "あなた"
    : `${event.actorDisplayNameSnapshot}さん`;

const TypingIndicator = ({ label }: { label: string | null }) => (
  <View className="min-h-0 justify-center bg-background px-4">
    {label ? (
      <Text className="pb-1 text-xs" color="muted" numberOfLines={1}>
        {label}
      </Text>
    ) : null}
  </View>
);

const formatValueChangeEvent = (
  actor: string,
  event: ChatEvent,
  label: string
) =>
  event.previousValue && event.nextValue
    ? `${actor}が${label}を「${event.previousValue}」から「${event.nextValue}」に変更しました`
    : event.body;

const formatEventBody = (event: ChatEvent, currentUserId: string) => {
  const actor = formatEventActor(event, currentUserId);

  if (event.kind === "group_name_updated") {
    return formatValueChangeEvent(actor, event, "グループ名");
  }

  if (event.kind === "group_emoji_updated") {
    return formatValueChangeEvent(actor, event, "グループアイコン");
  }

  if (event.kind === "display_name_updated") {
    return formatValueChangeEvent(actor, event, "名前");
  }

  if (event.kind === "invite_code_regenerated") {
    return `${actor}が招待リンクを再発行しました`;
  }

  if (event.kind === "member_joined" || event.kind === "member_left") {
    return event.actorInstantUserId === currentUserId
      ? event.body.replace(`${event.actorDisplayNameSnapshot}さん`, "あなた")
      : event.body;
  }

  if (event.kind === "member_removed") {
    const targetDisplayName = event.targetDisplayNameSnapshot ?? "メンバー";
    const target =
      event.targetInstantUserId === currentUserId
        ? "あなた"
        : `${targetDisplayName}さん`;

    return `${actor}が${target}をグループから削除しました`;
  }

  return event.body;
};

const EventRow = ({
  currentUserId,
  event,
}: {
  currentUserId: string;
  event: ChatEvent;
}) => (
  <View className="items-center py-1">
    <View className="max-w-[88%] items-center px-3 py-1">
      <Text className="text-[10px] leading-tight" color="muted">
        {messageTimeFormatter.format(new Date(event.createdAt))}
      </Text>
      <Text className="text-center text-xs leading-4" color="muted">
        {formatEventBody(event, currentUserId)}
      </Text>
    </View>
  </View>
);

const MessageBubble = ({
  isOwnMessage,
  message,
  readReceiptMode,
  showAuthor,
}: {
  isOwnMessage: boolean;
  message: ChatMessage;
  readReceiptMode: "count" | "direct";
  showAuthor: boolean;
}) => {
  const { toast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const popoverTriggerRef = useRef<PopoverTriggerRef>(null);

  const copyMessage = async () => {
    setIsMenuOpen(false);

    try {
      await copyMessageBody(message.body);
      toast.show({
        description: "メッセージをクリップボードにコピーしました。",
        label: "コピーしました",
        variant: "success",
      });
    } catch (error) {
      Alert.alert(
        "コピーできません",
        error instanceof Error
          ? error.message
          : "時間をおいて再試行してください"
      );
    }
  };

  return (
    <View className={isOwnMessage ? "items-end" : "items-start"}>
      {isOwnMessage || !showAuthor ? null : (
        <Text className="mb-0.5 px-1 text-xs" color="muted" numberOfLines={1}>
          {message.authorDisplayName}
        </Text>
      )}
      <View
        className={
          isOwnMessage
            ? "flex-row-reverse items-end gap-1.5"
            : "flex-row items-end gap-1.5"
        }
      >
        <Popover
          className="max-w-[82%]"
          isOpen={isMenuOpen}
          onOpenChange={setIsMenuOpen}
        >
          <Popover.Trigger asChild ref={popoverTriggerRef}>
            <Pressable
              className={
                isOwnMessage
                  ? "rounded-lg bg-accent px-3 py-1.5"
                  : "rounded-lg bg-foreground/5 px-3 py-1.5"
              }
              onLongPress={() => {
                popoverTriggerRef.current?.open();
              }}
            >
              <LinkifiedText
                className={
                  isOwnMessage ? "text-accent-foreground" : "text-foreground"
                }
                linkClassName={
                  isOwnMessage
                    ? "text-accent-foreground underline"
                    : "text-foreground underline"
                }
                text={message.body}
              />
              <InviteLinkCard
                inviteCode={getInviteCodeFromText(message.body)}
                isOwnMessage={isOwnMessage}
              />
            </Pressable>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Overlay />
            <Popover.Content
              align={isOwnMessage ? "end" : "start"}
              className="rounded-lg border border-border p-1"
              offset={6}
              placement="top"
              presentation="popover"
              width={128}
            >
              <Button
                className="w-full justify-start"
                onPress={() => {
                  copyMessage().catch(() => undefined);
                }}
                size="sm"
                variant="ghost"
              >
                <Button.Label>コピー</Button.Label>
              </Button>
            </Popover.Content>
          </Popover.Portal>
        </Popover>
        <MessageMetadata
          isOwnMessage={isOwnMessage}
          message={message}
          readReceiptMode={readReceiptMode}
        />
      </View>
    </View>
  );
};

const InviteLinkCard = ({
  inviteCode,
  isOwnMessage,
}: {
  inviteCode?: string;
  isOwnMessage: boolean;
}) => {
  const router = useRouter();
  const [accentForegroundColor, foregroundColor] = useThemeColor([
    "accent-foreground",
    "foreground",
  ]);
  const invite = useQuery(
    convexApi.invites.preview,
    inviteCode ? { inviteCode } : "skip"
  );

  if (!inviteCode) {
    return null;
  }

  const iconColor = isOwnMessage ? accentForegroundColor : foregroundColor;
  const title = invite
    ? `${invite.groupEmoji} ${invite.groupName}`
    : "グループ招待";
  const description =
    invite === undefined ? "招待リンクを確認しています" : "タップして参加";

  return (
    <Pressable
      accessibilityLabel={`${title}の招待を開く`}
      className={
        isOwnMessage
          ? "mt-2 min-w-52 rounded-md bg-accent-foreground/15 p-3"
          : "mt-2 min-w-52 rounded-md bg-background p-3"
      }
      onPress={() => {
        router.push(`/invite/${encodeURIComponent(inviteCode)}`);
      }}
    >
      <View className="flex-row items-center gap-2">
        <SymbolView
          name={{
            android: "group_add",
            ios: "person.2.badge.plus",
            web: "group_add",
          }}
          size={18}
          tintColor={iconColor}
        />
        <View className="min-w-0 flex-1">
          <Text
            className={
              isOwnMessage
                ? "font-semibold text-accent-foreground text-sm"
                : "font-semibold text-foreground text-sm"
            }
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            className={
              isOwnMessage
                ? "text-accent-foreground/80 text-xs"
                : "text-muted text-xs"
            }
            numberOfLines={1}
          >
            {description}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const MessageMetadata = ({
  isOwnMessage,
  message,
  readReceiptMode,
}: {
  isOwnMessage: boolean;
  message: ChatMessage;
  readReceiptMode: "count" | "direct";
}) => {
  const mutedColor = useThemeColor("muted");
  let readLabel: string | null = null;

  if (isOwnMessage && message.readCount > 0) {
    readLabel =
      readReceiptMode === "count" ? `既読 ${message.readCount}` : "既読";
  }

  const isSending =
    isOwnMessage && message._id.startsWith(optimisticMessageIdPrefix);

  return (
    <View className={isOwnMessage ? "mb-0.5 items-end" : "mb-0.5 items-start"}>
      {readLabel ? (
        <Text className="text-[10px] leading-tight" color="muted">
          {readLabel}
        </Text>
      ) : null}
      {isSending ? (
        <View className="h-3 justify-center">
          <SymbolView
            name={{ android: "send", ios: "paperplane", web: "send" }}
            size={10}
            tintColor={mutedColor}
          />
        </View>
      ) : (
        <Text className="text-[10px] leading-tight" color="muted">
          {messageTimeFormatter.format(new Date(message.createdAt))}
        </Text>
      )}
    </View>
  );
};

const DateBadge = ({ date }: { date: string }) => (
  <View className="items-center py-2">
    <View className="rounded-full bg-surface-secondary px-3 py-1">
      <Text className="font-medium text-xs" color="muted">
        {date}
      </Text>
    </View>
  </View>
);
