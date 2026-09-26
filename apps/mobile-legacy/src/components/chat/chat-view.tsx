import "dayjs/locale/ja";
import {
  type BubbleProps,
  Chat,
  type MessageMenuItem,
  type MessageTextProps,
  type ReplyMessage,
} from "@kesha-antonov/react-native-chat";
import { useMutation } from "convex/react";
import { setStringAsync } from "expo-clipboard";
import { EmojiSheetModule } from "expo-native-sheet-emojis";
import { useRouter } from "expo-router";
import { Typography, useThemeColor, useToast } from "heroui-native";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, type FlatList, Keyboard, Linking, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useUniwind } from "uniwind";
import {
  AppHeader,
  type AppHeaderAction,
} from "@/components/navigation/app-header";
import type { ChatPresenceMember } from "@/lib/chat-presence";
import { getInviteCodeFromInviteUrl } from "@/lib/invite-links";
import { api as convexApi } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  CHAT_REACTION_EMOJIS,
  MAX_CHAT_MESSAGE_LENGTH,
} from "../../../shared/chat";
import { renderChatDay } from "./chat-day";
import {
  ChatLoadingIndicator,
  renderEarlierMessagesLoading,
} from "./chat-loading";
import {
  buildChatMessages,
  type ChatEvent,
  type ChatMessage,
  type DisplayMessage,
  type ReadReceiptMode,
} from "./chat-model";
import { getInviteCodeFromText, InviteLinkCard } from "./invite-link-card";
import {
  renderChatBubble,
  renderChatReply,
  renderChatReplyPreview,
  renderChatSystemMessage,
} from "./message-layout";
import { optimisticallyToggleReaction } from "./optimistic-reactions";
import { useChatTyping } from "./use-chat-typing";

// Retain the public types consumed by the chat routes.
export type { ChatEvent, ChatMessage } from "./chat-model";

type ChatViewProps = {
  currentUserId: string;
  events?: ChatEvent[];
  isLoadingMore: boolean;
  isLoadingInitial: boolean;
  canLoadMore: boolean;
  messages: ChatMessage[];
  onBack: () => void;
  onLoadMore: () => void;
  onSend: (
    body: string,
    replyToMessageId?: Id<"chatMessages">
  ) => Promise<void>;
  presenceMembers: ChatPresenceMember[];
  presenceRoomId: string;
  readReceiptMode: ReadReceiptMode;
  rightActions?: AppHeaderAction[];
  title: string;
  topContent?: ReactNode;
};

const EMPTY_EVENTS: ChatEvent[] = [];
const createMenuIcon =
  (path: string): NonNullable<MessageMenuItem["icon"]> =>
  ({ color, size }) => (
    <Svg
      fill="none"
      height={size}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={size}
    >
      <Path d={path} />
    </Svg>
  );
const copyIcon = createMenuIcon("M9 9h12v12H9z M5 15H3V3h12v2");
const replyIcon = createMenuIcon("M9 17l-5-5 5-5 M4 12h10a6 6 0 0 1 6 6");
const CHAT_ICONS: ComponentProps<typeof Chat>["icons"] = {
  send: ({ color, size }) => (
    <Svg
      fill="none"
      height={size}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
      width={size}
    >
      <Path d="M12 19V5M5 12l7-7 7 7" />
    </Svg>
  ),
};
const showError = (title: string, error: unknown) => {
  Alert.alert(
    title,
    error instanceof Error ? error.message : "時間をおいて再試行してください"
  );
};

const renderInviteCard = ({
  currentMessage,
  position,
}: BubbleProps<DisplayMessage>) => (
  <InviteLinkCard
    inviteCode={getInviteCodeFromText(currentMessage.text)}
    isOwnMessage={position === "right"}
  />
);

export const ChatView = ({
  currentUserId,
  events = EMPTY_EVENTS,
  isLoadingMore,
  isLoadingInitial,
  canLoadMore,
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
  const router = useRouter();
  const { toast } = useToast();
  const { theme: colorScheme } = useUniwind();
  const [
    accent,
    accentForeground,
    background,
    foreground,
    muted,
    surface,
    border,
  ] = useThemeColor([
    "accent",
    "accent-foreground",
    "background",
    "foreground",
    "muted",
    "surface",
    "border",
  ]);
  const chatBackground = colorScheme === "dark" ? background : surface;
  const incomingBubble = colorScheme === "dark" ? surface : background;
  const theme = useMemo(
    () => ({
      colors: {
        accent,
        background: chatBackground,
        incomingBubble,
        incomingText: foreground,
        outgoingBubble: accent,
        outgoingText: accentForeground,
        outgoingMeta: accentForeground,
        incomingMeta: muted,
        inputBarBackground: chatBackground,
        inputBackground: incomingBubble,
        inputText: foreground,
        placeholder: muted,
        separator: border,
        senderName: muted,
        surface,
        dayPillBackground: incomingBubble,
        dayPillText: muted,
      },
      radii: { bubble: 12, inputField: 12 },
      spacing: { bubblePaddingV: 8, bubblePaddingH: 12 },
      composer: { maxHeight: 128 },
    }),
    [
      accent,
      accentForeground,
      chatBackground,
      incomingBubble,
      foreground,
      muted,
      surface,
      border,
    ]
  );
  const [body, setBody] = useState("");
  const [replyMessage, setReplyMessage] = useState<ReplyMessage | null>(null);
  const [isSending, setIsSending] = useState(false);
  const sendingRef = useRef(false);
  const typingSummary = useChatTyping(
    currentUserId,
    presenceRoomId,
    presenceMembers,
    body.trim().length > 0
  );
  const toggleReaction = useMutation(
    convexApi.chat.toggleReaction
  ).withOptimisticUpdate((store, args) => {
    optimisticallyToggleReaction(store, args, currentUserId);
  });
  const displayMessages = useMemo(
    () => buildChatMessages(messages, events, currentUserId, readReceiptMode),
    [messages, events, currentUserId, readReceiptMode]
  );
  const messageListRef = useRef<FlatList<DisplayMessage> | null>(null);
  const pendingSendScroll = useRef<{ previousId?: string } | null>(null);
  const latestOwnMessageId = displayMessages.find(
    (message) => !message.system && message.user._id === currentUserId
  )?._id;
  useEffect(() => {
    const request = pendingSendScroll.current;
    if (!request || latestOwnMessageId === request.previousId) {
      return;
    }
    // Let the newly inserted message render before scrolling to it.
    const frame = requestAnimationFrame(() => {
      if (pendingSendScroll.current !== request) {
        return;
      }
      messageListRef.current?.scrollToOffset({ offset: 0, animated: true });
      pendingSendScroll.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [latestOwnMessageId]);
  const [replyTarget, setReplyTarget] = useState<string | number | null>(null);
  const jumpToReply = useCallback((message: ReplyMessage) => {
    Keyboard.dismiss();
    setReplyTarget(message._id);
  }, []);
  useEffect(() => {
    if (replyTarget === null || isLoadingInitial || isLoadingMore) {
      return;
    }
    const index = displayMessages.findIndex(
      (message) => message._id === replyTarget
    );
    if (index >= 0) {
      // Wait for the newly loaded list data to commit before locating its row.
      const frame = requestAnimationFrame(() => {
        const list = messageListRef.current;
        if (!list) {
          return;
        }
        try {
          list.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
        } catch (error) {
          showError("返信元を表示できません", error);
        }
        setReplyTarget(null);
      });
      return () => cancelAnimationFrame(frame);
    }
    if (canLoadMore) {
      onLoadMore();
      return;
    }
    setReplyTarget(null);
    Alert.alert(
      "返信元が見つかりません",
      "削除されたメッセージの可能性があります。"
    );
  }, [
    replyTarget,
    displayMessages,
    isLoadingInitial,
    isLoadingMore,
    canLoadMore,
    onLoadMore,
  ]);
  const user = useMemo(() => ({ _id: currentUserId }), [currentUserId]);
  const selectReply = useCallback((message: DisplayMessage) => {
    if (message.messageId && !sendingRef.current) {
      setReplyMessage({
        _id: message.messageId,
        text: message.text,
        user: message.user,
      });
    }
  }, []);
  const reply = useMemo(
    () => ({
      message: replyMessage,
      onPress: jumpToReply,
      renderPreview: renderChatReplyPreview,
      renderMessageReply: renderChatReply,
      onClear: () => setReplyMessage(null),
      swipe: { isEnabled: true, onSwipe: selectReply },
    }),
    [replyMessage, selectReply, jumpToReply]
  );
  const pendingReactions = useRef(new Set<string>());
  const changeReaction = useCallback(
    async (message: DisplayMessage, emoji: string) => {
      if (!message.messageId) {
        return;
      }
      const key = `${message.messageId}:${emoji}`;
      if (pendingReactions.current.has(key)) {
        return;
      }
      pendingReactions.current.add(key);
      try {
        await toggleReaction({ messageId: message.messageId, emoji });
      } finally {
        pendingReactions.current.delete(key);
      }
    },
    [toggleReaction]
  );
  const pickingEmoji = useRef(false);
  const pickReaction = useCallback(
    async (message: DisplayMessage) => {
      if (!message.messageId || pickingEmoji.current) {
        return;
      }
      pickingEmoji.current = true;
      Keyboard.dismiss();
      try {
        // Let the library dismiss its native context-menu modal before presenting a sheet.
        await new Promise((resolve) => setTimeout(resolve, 350));
        const result = await EmojiSheetModule.present({
          theme: {
            accentColor: accent,
            backgroundColor: background,
            textColor: foreground,
            textSecondaryColor: muted,
            searchBarBackgroundColor: surface,
            dividerColor: border,
          },
          translations: {
            searchPlaceholder: "絵文字を検索",
            noResultsText: "絵文字が見つかりません",
          },
        });
        if (!result.cancelled) {
          await changeReaction(message, result.emoji);
        }
      } catch (error) {
        showError("リアクションを変更できません", error);
      } finally {
        pickingEmoji.current = false;
      }
    },
    [changeReaction, accent, background, foreground, muted, surface, border]
  );
  const reactions = useMemo(
    () => ({
      isEnabled: true,
      emojis: [...CHAT_REACTION_EMOJIS.slice(0, 4), "＋"],
      onReactionPress: (message: DisplayMessage, emoji: string) => {
        if (emoji === "＋") {
          return pickReaction(message);
        }
        if (message.messageId) {
          changeReaction(message, emoji).catch((error: unknown) =>
            showError("リアクションを変更できません", error)
          );
        }
      },
    }),
    [changeReaction, pickReaction]
  );
  const messageActions = useCallback(
    (message: DisplayMessage): MessageMenuItem[] => [
      ...(message.messageId
        ? [
            {
              icon: replyIcon,
              label: "返信",
              onPress: () => selectReply(message),
            },
          ]
        : []),
      {
        icon: copyIcon,
        label: "コピー",
        onPress: async () => {
          try {
            const copied = await setStringAsync(message.text);
            if (!copied) {
              throw new Error("もう一度お試しください");
            }
            toast.show({ label: "コピーしました", variant: "success" });
          } catch (error) {
            showError("コピーできません", error);
          }
        },
      },
    ],
    [selectReply, toast]
  );
  const sendMessage = useCallback(
    async ([message]: DisplayMessage[]) => {
      if (!message?.text.trim() || sendingRef.current) {
        return;
      }
      const replyToMessageId = messages.find(
        (item) => item._id === message.replyMessage?._id
      )?._id;
      sendingRef.current = true;
      pendingSendScroll.current = { previousId: latestOwnMessageId };
      setReplyTarget(null);
      setIsSending(true);
      setBody("");
      setReplyMessage(null);
      try {
        await onSend(message.text.trim(), replyToMessageId);
        setBody("");
      } catch (error) {
        pendingSendScroll.current = null;
        setBody(message.text);
        setReplyMessage(message.replyMessage ?? null);
        showError("送信できませんでした", error);
      } finally {
        sendingRef.current = false;
        setIsSending(false);
      }
    },
    [messages, onSend, latestOwnMessageId]
  );
  const textInputProps = useMemo(
    () => ({
      accessibilityLabel: "メッセージ",
      maxLength: MAX_CHAT_MESSAGE_LENGTH,
      editable: !isSending,
      onChangeText: setBody,
      value: body,
    }),
    [body, isSending]
  );
  const messageTextProps = useMemo<Partial<MessageTextProps<DisplayMessage>>>(
    () => ({
      onPress: (_message, url) => {
        const inviteCode = getInviteCodeFromInviteUrl(url);
        if (inviteCode) {
          router.push(`/invite/${encodeURIComponent(inviteCode)}`);
          return;
        }
        Linking.openURL(url).catch((error: unknown) =>
          showError("リンクを開けません", error)
        );
      },
    }),
    [router]
  );
  const listProps = useMemo(
    () => ({
      // Inverted lists keep newest messages at offset 0. Override the library's
      // bottom autoscroll, which otherwise moves toward the oldest messages.
      maintainVisibleContentPosition: {
        minIndexForVisible: 0,
        autoscrollToTopThreshold: 80,
      },
      // Pass the empty view directly to the list so it handles inversion.
      ListEmptyComponent: isLoadingInitial ? undefined : (
        <View className="items-center px-6 py-12">
          <Typography color="muted">まだメッセージがありません</Typography>
        </View>
      ),
    }),
    [isLoadingInitial]
  );
  const loadEarlierMessagesProps = useMemo(
    () => ({
      isAvailable: canLoadMore || isLoadingMore,
      isLoading: isLoadingMore,
      isInfiniteScrollEnabled: true,
      onPress: onLoadMore,
    }),
    [canLoadMore, isLoadingMore, onLoadMore]
  );
  const renderTypingIndicator = useCallback(
    () =>
      typingSummary ? (
        <Typography className="px-4 py-1 text-xs" color="muted">
          {typingSummary}
        </Typography>
      ) : null,
    [typingSummary]
  );

  return (
    <View className="flex-1 bg-surface dark:bg-background">
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
      {isLoadingInitial && displayMessages.length === 0 ? (
        <ChatLoadingIndicator />
      ) : (
        <Chat<DisplayMessage>
          darkTheme={theme}
          enableGestureHandlerRootView={false}
          enableKeyboardProvider={false}
          icons={CHAT_ICONS}
          isCustomViewBottom
          isFlashListEnabled={false}
          isInverted
          isScrollToBottomEnabled
          isTyping={Boolean(typingSummary)}
          isUsernameVisible
          listProps={listProps}
          loadEarlierMessagesProps={loadEarlierMessagesProps}
          locale="ja"
          messageActions={messageActions}
          messages={displayMessages}
          // The library declares an animated component type rather than its ref instance.
          messagesContainerRef={
            messageListRef as unknown as ComponentProps<
              typeof Chat<DisplayMessage>
            >["messagesContainerRef"]
          }
          messageTextProps={messageTextProps}
          onSend={sendMessage}
          reactions={reactions}
          renderAvatar={null}
          renderBubble={renderChatBubble}
          renderCustomView={renderInviteCard}
          renderDay={renderChatDay}
          renderLoadEarlier={renderEarlierMessagesLoading}
          renderSystemMessage={renderChatSystemMessage}
          renderTypingIndicator={renderTypingIndicator}
          reply={reply}
          text={body}
          textInputProps={textInputProps}
          theme={theme}
          timeFormat="HH:mm"
          user={user}
        />
      )}
    </View>
  );
};
