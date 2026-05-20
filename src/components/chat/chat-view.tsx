import { useQuery } from "convex/react";
import { setStringAsync } from "expo-clipboard";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import {
  Button,
  Popover,
  type PopoverTriggerRef,
  Text,
  useThemeColor,
} from "heroui-native";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AppHeader,
  type AppHeaderAction,
} from "@/components/navigation/app-header";
import { getInviteCodeFromInviteUrl } from "@/lib/invite-links";
import { api as convexApi } from "../../../convex/_generated/api";
import { LinkifiedText } from "../common/linkified-text";

export type ChatMessage = {
  _id: string;
  authorDisplayName: string;
  authorJazzUserId: string;
  body: string;
  createdAt: number;
  readCount: number;
};

type ChatListItem =
  | {
      message: ChatMessage;
      showAuthor: boolean;
      type: "message";
    }
  | {
      date: string;
      key: string;
      type: "date";
    };

type ChatViewProps = {
  currentUserId: string;
  isLoadingMore: boolean;
  messages: ChatMessage[];
  onBack: () => void;
  onLoadMore: () => void;
  onSend: (body: string) => Promise<void>;
  readReceiptMode: "count" | "direct";
  rightActions?: AppHeaderAction[];
  title: string;
  topContent?: ReactNode;
};

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

const buildChatListItems = (messages: ChatMessage[]): ChatListItem[] => {
  const items: ChatListItem[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const currentDateKey = dateKeyFormatter.format(new Date(message.createdAt));
    const nextMessage = messages[index + 1];
    const nextMessageDateKey = nextMessage
      ? dateKeyFormatter.format(new Date(nextMessage.createdAt))
      : null;
    const showAuthor =
      !nextMessage ||
      nextMessage.authorJazzUserId !== message.authorJazzUserId ||
      nextMessageDateKey !== currentDateKey;

    items.push({ message, showAuthor, type: "message" });

    if (!nextMessage || nextMessageDateKey !== currentDateKey) {
      const messageDate = new Date(message.createdAt);

      items.push({
        date: formatDateBadge(messageDate),
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

export const ChatView = ({
  currentUserId,
  isLoadingMore,
  messages,
  onBack,
  onLoadMore,
  onSend,
  readReceiptMode,
  rightActions,
  title,
  topContent,
}: ChatViewProps) => {
  const [accentForegroundColor, fieldForegroundColor, fieldPlaceholderColor] =
    useThemeColor([
      "accent-foreground",
      "field-foreground",
      "field-placeholder",
    ]);
  const insets = useSafeAreaInsets();
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const trimmedBody = body.trim();
  const isSendDisabled = isSending || !trimmedBody;
  const listItems = useMemo(() => buildChatListItems(messages), [messages]);

  const sendMessage = async () => {
    if (isSendDisabled) {
      return;
    }

    const messageBody = trimmedBody;
    setBody("");
    setIsSending(true);

    try {
      await onSend(messageBody);
    } catch {
      setBody(messageBody);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
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
      <FlatList
        className="flex-1"
        contentContainerClassName="gap-2 px-4 py-3"
        data={listItems}
        inverted={true}
        keyExtractor={(item) =>
          item.type === "message" ? item.message._id : item.key
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center px-6 py-12">
            <Text className="text-center text-base" color="muted">
              まだメッセージがありません
            </Text>
          </View>
        }
        onEndReached={() => {
          if (!isLoadingMore) {
            onLoadMore();
          }
        }}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) =>
          item.type === "date" ? (
            <DateBadge date={item.date} />
          ) : (
            <MessageBubble
              isOwnMessage={item.message.authorJazzUserId === currentUserId}
              message={item.message}
              readReceiptMode={readReceiptMode}
              showAuthor={item.showAuthor}
            />
          )
        }
      />
      <View
        className="border-border border-t bg-background px-3 pt-2"
        style={{ paddingBottom: Math.max(12, insets.bottom + 8) }}
      >
        <View className="flex-row items-end gap-2">
          <TextInput
            accessibilityLabel="メッセージ"
            className="max-h-32 min-h-10 flex-1 rounded-lg border border-border bg-content1 px-3 py-2 text-base"
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
          <Button
            accessibilityLabel="メッセージを送信"
            isDisabled={isSendDisabled}
            isIconOnly={true}
            onPress={sendMessage}
            size="sm"
            variant="primary"
          >
            <SymbolView
              name={{ android: "send", ios: "paperplane.fill", web: "send" }}
              size={16}
              tintColor={accentForegroundColor}
            />
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const popoverTriggerRef = useRef<PopoverTriggerRef>(null);

  const copyMessage = async () => {
    setIsMenuOpen(false);

    try {
      await copyMessageBody(message.body);
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
  const title = invite?.groupName ?? "グループ招待";
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
  let readLabel: string | null = null;

  if (isOwnMessage && message.readCount > 0) {
    readLabel =
      readReceiptMode === "count" ? `既読 ${message.readCount}` : "既読";
  }

  return (
    <View className={isOwnMessage ? "mb-0.5 items-end" : "mb-0.5 items-start"}>
      {readLabel ? (
        <Text className="text-[10px] leading-tight" color="muted">
          {readLabel}
        </Text>
      ) : null}
      <Text className="text-[10px] leading-tight" color="muted">
        {messageTimeFormatter.format(new Date(message.createdAt))}
      </Text>
    </View>
  );
};

const DateBadge = ({ date }: { date: string }) => (
  <View className="items-center py-2">
    <View className="rounded-full bg-content2 px-3 py-1">
      <Text className="font-medium text-xs" color="muted">
        {date}
      </Text>
    </View>
  </View>
);
