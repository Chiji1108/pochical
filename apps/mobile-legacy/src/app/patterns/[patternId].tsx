import { useLocalSearchParams, useRouter } from "expo-router";
import { Typography } from "heroui-native";
import { View } from "react-native";
import { AppHeader } from "@/components/navigation/app-header";
import { PatternEditView } from "@/components/pattern/pattern-edit-view";
import { useCurrentUserId, usePatternById } from "@/lib/work-data";

export default function PatternDetail() {
  const router = useRouter();
  const currentUserId = useCurrentUserId();
  const { patternId } = useLocalSearchParams<{ patternId: string }>();
  const pattern = usePatternById(patternId, currentUserId);

  if (!pattern) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader
          leftAction={{
            accessibilityLabel: "シフトパターン一覧に戻る",
            icon: {
              android: "arrow_back",
              ios: "chevron.left",
              web: "arrow_back",
            },
            label: "戻る",
            onPress: () => {
              router.back();
            },
          }}
          title="編集"
        />
        <View className="flex-1 items-center justify-center px-6">
          <Typography className="text-center text-base" color="muted">
            シフトパターンが見つかりません
          </Typography>
        </View>
      </View>
    );
  }

  return <PatternEditView pattern={pattern} />;
}
