import { expect, mock, spyOn, test } from "bun:test";
import { act, create } from "react-test-renderer";

const completions: ((result: { finished: boolean }) => void)[] = [];
mock.module("react-native", () => ({
  Animated: {
    Value: class {
      setValue() {
        // No native animated value is needed in this test.
      }
      stopAnimation() {
        // No native animation runs in this test.
      }
    },
    View: "AnimatedView",
    timing: () => ({
      start: (callback?: (result: { finished: boolean }) => void) => {
        if (callback) {
          completions.push(callback);
        }
      },
    }),
  },
  Dimensions: { get: () => ({ width: 402, height: 874 }) },
  Modal: "Modal",
  Pressable: "Pressable",
  View: "View",
  Text: "Text",
  StyleSheet: {
    create: (styles: unknown) => styles,
    absoluteFill: {},
    hairlineWidth: 0.5,
  },
}));
mock.module(
  "../node_modules/@kesha-antonov/react-native-chat/lib/hooks/useTheme",
  () => ({
    useThemedStyles: () => ({}),
  })
);
const { ContextMenu } = await import(
  "../node_modules/@kesha-antonov/react-native-chat/lib/components/ContextMenu.js"
);

test("reaction is applied immediately once after dismissal without waiting for animation", async () => {
  const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const errors = spyOn(console, "error").mockImplementation(() => undefined);
  const events: string[] = [];
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(() => {
      renderer = create(
        <ContextMenu
          items={[]}
          onDismiss={() => events.push("dismiss")}
          reactions={{
            emojis: ["👍"],
            onSelect: (emoji: string) => events.push(emoji),
          }}
          visible
        />
      );
    });
    const reaction = renderer!.root.findAllByType("Pressable")[1];
    await act(() => {
      reaction.props.onPress();
      reaction.props.onPress();
    });
    expect(completions).toHaveLength(0);
    expect(events).toEqual(["dismiss", "👍"]);
  } finally {
    await act(() => renderer?.unmount());
    errors.mockRestore();
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
    completions.length = 0;
  }
});
