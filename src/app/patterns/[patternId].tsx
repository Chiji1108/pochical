import { useLocalSearchParams } from "expo-router";
import { Text } from "heroui-native";
import { useAll } from "jazz-tools/react-native";
import { View } from "react-native";
import { PatternEditView } from "@/components/pattern/pattern-edit-view";
import { app } from "@/schema";

export default function PatternDetail() {
  const { patternId } = useLocalSearchParams<{ patternId: string }>();
  const [pattern] =
    useAll(app.patterns.where({ id: patternId }).limit(1)) ?? [];

  if (!pattern) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-center text-base" color="muted">
          パターンが見つかりません
        </Text>
      </View>
    );
  }

  return <PatternEditView pattern={pattern} />;
}
