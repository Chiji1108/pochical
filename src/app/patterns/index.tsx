import { useRouter } from "expo-router";
import { View } from "react-native";
import { AppHeader } from "@/components/navigation/app-header";
import { PatternListView } from "@/components/pattern/pattern-list-view";

export default function Patterns() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        leftAction={{
          accessibilityLabel: "閉じる",
          label: "閉じる",
          onPress: () => {
            router.back();
          },
        }}
        rightAction={{
          accessibilityLabel: "パターンを新規追加",
          icon: {
            android: "add",
            ios: "plus",
            web: "add",
          },
          onPress: () => {
            router.push("/patterns/new");
          },
        }}
        title="パターン"
      />
      <PatternListView />
    </View>
  );
}
