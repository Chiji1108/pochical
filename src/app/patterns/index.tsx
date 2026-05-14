import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Text } from "heroui-native";
import { Button } from "heroui-native/button";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PatternListView } from "@/components/pattern/pattern-list-view";

export default function Patterns() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="relative h-14 flex-row items-center justify-between border-foreground/10 border-b px-3">
        <Text className="absolute inset-x-20 text-center font-semibold text-xl">
          パターン
        </Text>
        <Button
          accessibilityLabel="閉じる"
          className="z-10 h-10 px-2"
          onPress={() => {
            router.back();
          }}
          variant="ghost"
        >
          <Button.Label>閉じる</Button.Label>
        </Button>
        <Button
          accessibilityLabel="パターンを新規追加"
          className="z-10 h-10 w-10 rounded-full px-0"
          onPress={() => {
            router.push("/patterns/new");
          }}
          variant="ghost"
        >
          <SymbolView
            name={{
              android: "add",
              ios: "plus",
              web: "add",
            }}
            size={20}
          />
        </Button>
      </View>
      <PatternListView />
    </View>
  );
}
