import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { ListGroup, PressableFeedback, Text } from "heroui-native";
import { useAll, useDb, useSession } from "jazz-tools/react-native";
import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader } from "@/components/navigation/app-header";
import {
  insertShiftPatternPreset,
  SHIFT_PATTERN_PRESETS,
  type ShiftPatternPreset,
  type ShiftPatternPresetPattern,
} from "@/lib/shift-pattern-presets";
import { app } from "@/schema";

const formatPresetPatternTime = (
  pattern: ShiftPatternPresetPattern
): string => {
  if (pattern.isAllDay) {
    return "終日";
  }

  if (!(pattern.start && pattern.end)) {
    return "時間未設定";
  }

  const formatTime = ([hour, minute]: [hour: number, minute: number]) =>
    `${hour}:${String(minute).padStart(2, "0")}`;

  return `${formatTime(pattern.start)}-${formatTime(pattern.end)}`;
};

export default function PatternPresets() {
  const db = useDb();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSession();
  const currentUserId = session?.user_id ?? "";
  const patterns =
    useAll(
      currentUserId
        ? app.patterns.where({ $createdBy: currentUserId })
        : undefined
    ) ?? [];

  const addPreset = (preset: ShiftPatternPreset) => {
    if (!session) {
      Alert.alert("作成できません", "接続後に作成できます。");
      return;
    }

    db.batch((batch) => {
      insertShiftPatternPreset(batch, preset, patterns.length);
    });

    router.replace("/patterns");
  };

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
        title="勤務体系を選択"
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        contentInsetAdjustmentBehavior="automatic"
      >
        {patterns.length > 0 ? (
          <Text className="px-1 text-sm" color="muted">
            現在のシフトパターンは残したまま追加されます
          </Text>
        ) : null}
        {SHIFT_PATTERN_PRESETS.map((preset) => (
          <PresetListItem
            isDisabled={!session}
            key={preset.id}
            onPress={() => {
              addPreset(preset);
            }}
            preset={preset}
          />
        ))}
      </ScrollView>
    </View>
  );
}

type PresetListItemProps = {
  isDisabled: boolean;
  onPress: () => void;
  preset: ShiftPatternPreset;
};

const PresetListItem = ({
  isDisabled,
  onPress,
  preset,
}: PresetListItemProps) => (
  <ListGroup>
    <PressableFeedback
      accessibilityLabel={`${preset.title}を追加`}
      animation={false}
      isDisabled={isDisabled}
      onPress={onPress}
    >
      <PressableFeedback.Scale>
        <ListGroup.Item disabled={isDisabled}>
          <ListGroup.ItemContent>
            <View className="gap-3 py-1">
              <View className="gap-1">
                <ListGroup.ItemTitle>{preset.title}</ListGroup.ItemTitle>
                <ListGroup.ItemDescription>
                  {preset.description}
                </ListGroup.ItemDescription>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {preset.patterns.map((pattern) => (
                  <View
                    className="rounded-lg bg-foreground/5 px-2.5 py-2"
                    key={`${preset.id}-${pattern.name}`}
                  >
                    <Text className="text-sm" numberOfLines={1}>
                      {pattern.emoji} {pattern.name}
                    </Text>
                    <Text className="text-[11px]" color="muted">
                      {formatPresetPatternTime(pattern)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix>
            <SymbolView
              name={{
                android: "add",
                ios: "plus",
                web: "add",
              }}
              size={18}
            />
          </ListGroup.ItemSuffix>
        </ListGroup.Item>
      </PressableFeedback.Scale>
      <PressableFeedback.Ripple />
    </PressableFeedback>
  </ListGroup>
);
