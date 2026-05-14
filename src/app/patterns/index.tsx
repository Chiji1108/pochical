import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { PatternListView } from "@/components/pattern/pattern-list-view";

export default function Patterns() {
  const router = useRouter();

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel="閉じる"
          onPress={() => {
            router.back();
          }}
        >
          閉じる
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="パターンを新規追加"
          icon="plus"
          onPress={() => {
            router.push("/patterns/new");
          }}
        />
      </Stack.Toolbar>
      <View className="flex-1 bg-background">
        <PatternListView />
      </View>
    </>
  );
}
