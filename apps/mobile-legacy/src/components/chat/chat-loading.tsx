import { Spinner } from "heroui-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { AppHeader } from "@/components/navigation/app-header";

const LOADING_DELAY_MS = 250;

export const ChatLoadingIndicator = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View className="flex-1 items-center justify-center">
      {visible ? (
        <Spinner accessibilityLabel="メッセージを読み込み中" size="sm" />
      ) : null}
    </View>
  );
};

export const ChatLoadingScreen = ({ onBack }: { onBack: () => void }) => (
  <View className="flex-1 bg-surface dark:bg-background">
    <AppHeader
      leftAction={{
        accessibilityLabel: "戻る",
        icon: { android: "arrow_back", ios: "chevron.left", web: "arrow_back" },
        label: "戻る",
        onPress: onBack,
      }}
      title="チャット"
    />
    <ChatLoadingIndicator />
  </View>
);

// Render callbacks must return a component rather than invoke its hooks directly.
export const renderEarlierMessagesLoading = ({
  isLoading,
}: {
  isLoading: boolean;
}) =>
  isLoading ? (
    <View className="items-center py-3">
      <Spinner accessibilityLabel="過去のメッセージを読み込み中" size="sm" />
    </View>
  ) : null;
