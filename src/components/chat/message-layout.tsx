import {
  Bubble,
  type BubbleProps,
  type ReplyProps,
  useTheme,
} from "@kesha-antonov/react-native-chat";
import dayjs from "dayjs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DisplayMessage } from "./chat-model";

const hide = () => null;

export const ChatBubble = (props: BubbleProps<DisplayMessage>) => {
  const theme = useTheme();
  const { currentMessage: message, previousMessage, position } = props;
  const own = position === "right";
  // At the oldest loaded message, the library supplies {} as the previous row.
  const showName =
    !own &&
    (previousMessage?.system ||
      previousMessage?.user?._id !== message.user._id ||
      !dayjs(previousMessage?.createdAt).isSame(message.createdAt, "day"));
  return (
    <View style={{ flex: 1, alignItems: own ? "flex-end" : "flex-start" }}>
      {showName && (
        <Text
          style={{
            color: theme.colors.senderName,
            fontSize: 12,
            marginBottom: 4,
            marginLeft: 4,
          }}
        >
          {message.user.name}
        </Text>
      )}
      <View
        style={{
          flexDirection: own ? "row-reverse" : "row",
          width: "100%",
          alignItems: "flex-end",
          gap: 6,
        }}
      >
        <View style={{ maxWidth: "76%", flexShrink: 1 }}>
          <Bubble
            {...props}
            bottomContainerStyle={{
              left: { display: "none" },
              right: { display: "none" },
            }}
            containerStyle={{ left: { flex: 0 }, right: { flex: 0 } }}
            isUsernameVisible={false}
            renderTicks={hide}
            renderTime={hide}
            wrapperStyle={{
              left: { maxWidth: "100%" },
              right: { maxWidth: "100%" },
            }}
          />
        </View>
        <View
          style={{
            alignItems: own ? "flex-end" : "flex-start",
            paddingBottom: 3,
          }}
        >
          {own && Boolean(message.readCount) && (
            <Text style={{ color: theme.colors.incomingMeta, fontSize: 10 }}>
              {message.readReceiptMode === "count"
                ? `既読 ${message.readCount}`
                : "既読"}
            </Text>
          )}
          <Text style={{ color: theme.colors.incomingMeta, fontSize: 10 }}>
            {message.pending
              ? "送信中"
              : dayjs(message.createdAt).format("H:mm")}
          </Text>
        </View>
      </View>
    </View>
  );
};

export const ChatSystemMessage = ({
  currentMessage,
}: {
  currentMessage: DisplayMessage;
}) => {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 20,
      }}
    >
      <Text
        style={{
          color: theme.colors.incomingMeta,
          fontSize: 11,
          marginBottom: 2,
        }}
      >
        {dayjs(currentMessage.createdAt).format("H:mm")}
      </Text>
      <Text
        style={{
          color: theme.colors.incomingMeta,
          fontSize: 12,
          textAlign: "center",
        }}
      >
        {currentMessage.text}
      </Text>
    </View>
  );
};

export const ChatReply: NonNullable<
  ReplyProps<DisplayMessage>["renderMessageReply"]
> = ({ replyMessage, position, onPress }) => {
  const theme = useTheme();
  const color =
    position === "right"
      ? theme.colors.outgoingText
      : theme.colors.incomingText;
  return (
    <Pressable
      accessibilityLabel={`${replyMessage.user?.name ?? "メンバー"}。返信元を表示`}
      accessibilityRole="button"
      disabled={!onPress}
      onPress={() => onPress?.(replyMessage)}
      style={{ paddingHorizontal: 12, paddingTop: 8 }}
    >
      <Text
        numberOfLines={1}
        style={{ color, fontWeight: "600", fontSize: 11, opacity: 0.85 }}
      >
        {replyMessage.user?.name ?? "メンバー"}
      </Text>
      <Text
        numberOfLines={2}
        style={{ color, fontSize: 13, marginTop: 3, opacity: 0.8 }}
      >
        {replyMessage.text}
      </Text>
      <View
        style={{
          height: StyleSheet.hairlineWidth,
          backgroundColor: color,
          opacity: 0.25,
          marginTop: 8,
          marginHorizontal: -12,
        }}
      />
    </Pressable>
  );
};

export const ChatReplyPreview: NonNullable<
  ReplyProps<DisplayMessage>["renderPreview"]
> = ({ replyMessage, onClearReply }) => {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 10,
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: theme.colors.separator,
      }}
    >
      <View
        style={{
          flex: 1,
          borderLeftWidth: 3,
          borderLeftColor: theme.colors.accent,
          paddingLeft: 8,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: theme.colors.accent, fontSize: 12 }}
        >
          {replyMessage.user?.name ?? "メンバー"}
        </Text>
        <Text
          numberOfLines={2}
          style={{ color: theme.colors.inputText, fontSize: 13 }}
        >
          {replyMessage.text}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="返信を取り消す"
        accessibilityRole="button"
        hitSlop={12}
        onPress={onClearReply}
        style={{ padding: 8 }}
      >
        <Text style={{ color: theme.colors.inputText, fontSize: 20 }}>×</Text>
      </Pressable>
    </View>
  );
};

// The chat library invokes render callbacks directly, sometimes inside useMemo.
// Return React elements so component hooks run in their own render boundary.
export const renderChatBubble = (props: BubbleProps<DisplayMessage>) => (
  <ChatBubble {...props} />
);
export const renderChatSystemMessage = (props: {
  currentMessage: DisplayMessage;
}) => <ChatSystemMessage {...props} />;
export const renderChatReply: NonNullable<
  ReplyProps<DisplayMessage>["renderMessageReply"]
> = (props) => <ChatReply {...props} />;
export const renderChatReplyPreview: NonNullable<
  ReplyProps<DisplayMessage>["renderPreview"]
> = (props) => <ChatReplyPreview {...props} />;
