import { expect, mock, spyOn, test } from "bun:test";
import { createContext, useContext, useMemo } from "react";
import { act, create } from "react-test-renderer";

const HOOK_WARNING = /Hooks|hook|useMemo/;
const playLightImpactHaptic = mock(() => undefined);
mock.module("../src/lib/haptics", () => ({ playLightImpactHaptic }));
const Theme = createContext({
  colors: {
    incomingMeta: "gray",
    senderName: "gray",
    outgoingText: "white",
    incomingText: "black",
    accent: "blue",
    separator: "gray",
    inputText: "black",
  },
});
mock.module("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  StyleSheet: { hairlineWidth: 0.5 },
}));
mock.module("@kesha-antonov/react-native-chat", () => ({
  Bubble: () => null,
  MessageReactions: () => null,
  useTheme: () => useContext(Theme),
}));

const {
  renderChatBubble,
  renderChatSystemMessage,
  renderChatReply,
  renderChatReplyPreview,
} = await import("../src/components/chat/message-layout");
const message = {
  _id: "message",
  text: "テスト",
  createdAt: 1,
  user: { _id: "user", name: "名前" },
};

const onReplyPress = mock(() => undefined);

// Reproduce the library calling render callbacks inside useMemo, not via JSX.
const LibraryRenderProbe = ({ text }: { text: string }) => {
  const content = useMemo(() => {
    const currentMessage = { ...message, text };
    return (
      <>
        {renderChatBubble({ currentMessage, position: "left" })}
        {renderChatSystemMessage({ currentMessage })}
        {renderChatReply({
          currentMessage,
          replyMessage: currentMessage,
          position: "left",
          onPress: onReplyPress,
        })}
        {renderChatReplyPreview({ replyMessage: currentMessage })}
      </>
    );
  }, [text]);
  return content;
};

test("chat render callbacks preserve hook boundaries inside the library's memoized rendering", async () => {
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const errors = spyOn(console, "error").mockImplementation(() => undefined);
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(() => {
      renderer = create(<LibraryRenderProbe text="最初" />);
    });
    await act(() => {
      renderer?.update(<LibraryRenderProbe text="更新" />);
    });
    expect(JSON.stringify(renderer?.toJSON())).toContain("更新");
    const hookErrors = errors.mock.calls.filter((args) =>
      HOOK_WARNING.test(args.map(String).join(" "))
    );
    expect(hookErrors).toEqual([]);
    const quote = renderer?.root.findByProps({
      accessibilityLabel: "名前。返信元を表示",
    });
    expect(quote).toBeDefined();
    await act(() => quote?.props.onPress());
    expect(onReplyPress).toHaveBeenCalledWith({ ...message, text: "更新" });
  } finally {
    await act(() => renderer?.unmount());
    errors.mockRestore();
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});

test("bubble sender names handle the library's empty previous-message sentinel", async () => {
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const errors = spyOn(console, "error").mockImplementation(() => undefined);
  let renderer: ReturnType<typeof create> | undefined;
  const cases = [
    { previous: {}, showName: true },
    { previous: undefined, showName: true },
    { previous: { system: true }, showName: true },
    { previous: message, showName: false },
    { previous: { ...message, user: { _id: "other" } }, showName: true },
    { previous: { ...message, createdAt: -86_400_000 }, showName: true },
  ];
  try {
    for (const { previous, showName } of cases) {
      // Runtime supplies {}, although the library's declaration requires IMessage.
      const element = renderChatBubble({
        currentMessage: message,
        position: "left",
        previousMessage: previous as typeof message | undefined,
      });
      await act(() => {
        if (renderer) {
          renderer.update(element);
        } else {
          renderer = create(element);
        }
      });
      expect(JSON.stringify(renderer?.toJSON()).includes("名前")).toBe(
        showName
      );
    }
  } finally {
    await act(() => renderer?.unmount());
    errors.mockRestore();
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});

test("long press triggers one light haptic and forwards the message callback", async () => {
  const { Bubble } = await import("@kesha-antonov/react-native-chat");
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const errors = spyOn(console, "error").mockImplementation(() => undefined);
  const onLongPressMessage = mock(() => undefined);
  playLightImpactHaptic.mockClear();
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(() => {
      renderer = create(
        renderChatBubble({
          currentMessage: message,
          position: "left",
          onLongPressMessage,
          reactions: { isEnabled: true },
        })
      );
    });
    expect(playLightImpactHaptic).not.toHaveBeenCalled();
    renderer!.root
      .findByType(Bubble)
      .props.onLongPressMessage(undefined, message);
    expect(playLightImpactHaptic).toHaveBeenCalledTimes(1);
    expect(onLongPressMessage).toHaveBeenCalledWith(undefined, message);
  } finally {
    await act(() => renderer?.unmount());
    errors.mockRestore();
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});

test("reactions stay outside the body and metadata row and preserve tap handling", async () => {
  const { Bubble, MessageReactions } = await import(
    "@kesha-antonov/react-native-chat"
  );
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const errors = spyOn(console, "error").mockImplementation(() => undefined);
  const onReactionPress = mock(() => undefined);
  let renderer: ReturnType<typeof create> | undefined;
  try {
    for (const position of ["left", "right"] as const) {
      for (const count of [2, 3, 4, 7]) {
        const currentMessage = {
          ...message,
          reactions: ["👍", "❤️", "😂", "😮", "😢", "👎", "🎉"]
            .slice(0, count)
            .map((emoji) => ({ emoji, userIds: ["user"] })),
          readCount: 1,
          readReceiptMode: "count" as const,
        };
        await act(() => {
          const element = renderChatBubble({
            currentMessage,
            position,
            user: message.user,
            reactions: { isEnabled: true, onReactionPress },
          });
          if (renderer) {
            renderer.update(element);
          } else {
            renderer = create(element);
          }
        });
        const bubble = renderer!.root.findByType(Bubble);
        const reactions = renderer!.root.findByType(MessageReactions);
        const bodyRow = bubble.parent!.parent!;
        const reactionsRow = reactions.parent!;
        expect(reactionsRow.parent).toBe(bodyRow.parent);
        expect(reactionsRow.props.style.width).toBe("76%");
        expect(bodyRow.findAllByType("Text").length).toBe(
          position === "right" ? 2 : 1
        );
        expect(bubble.props.reactions.renderReactions()).toBeNull();
        expect(bubble.props.reactions.isEnabled).toBe(true);
        expect(reactions.props.reactions).toHaveLength(count);
        expect(reactions.props.currentUserId).toBe("user");
        reactions.props.onReactionPress("👍");
        expect(onReactionPress).toHaveBeenLastCalledWith(currentMessage, "👍");
      }
    }
  } finally {
    await act(() => renderer?.unmount());
    errors.mockRestore();
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
