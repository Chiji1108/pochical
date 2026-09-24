import { expect, mock, spyOn, test } from "bun:test";
import { createContext, useContext, useMemo } from "react";
import { act, create } from "react-test-renderer";

const HOOK_WARNING = /Hooks|hook|useMemo/;

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
