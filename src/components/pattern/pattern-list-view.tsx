import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Button, ListGroup, Separator, Tabs, Text } from "heroui-native";
import { useAll, useDb, useSession } from "jazz-tools/react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, View } from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Sortable, {
  type SortableGridDragEndCallback,
  type SortableGridRenderItem,
} from "react-native-sortables";
import {
  insertShiftPatternPreset,
  SHIFT_PATTERN_PRESETS,
  type ShiftPatternPreset,
  type ShiftPatternPresetCategory,
  type ShiftPatternPresetPattern,
} from "@/lib/shift-pattern-presets";
import { deleteShiftPatternsAndRelatedData } from "@/lib/work-data-actions";
import { app, type Pattern } from "@/schema";

const PATTERN_COLUMN_COUNT = 6;
const PATTERN_GRID_GAP = 8;

const PRESET_TABS: {
  label: string;
  value: ShiftPatternPresetCategory;
}[] = [
  { label: "まとめて追加", value: "workstyle" },
  { label: "1個だけ追加", value: "other" },
];

export const PatternListView = () => {
  const db = useDb();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSession();
  const currentUserId = session?.user_id ?? "";
  const scrollableRef = useAnimatedRef<Animated.ScrollView>();
  const isDraggingRef = useRef(false);
  const clearDraggingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [activeTab, setActiveTab] =
    useState<ShiftPatternPresetCategory>("workstyle");
  const patterns =
    useAll(
      currentUserId
        ? app.patterns.where({ $createdBy: currentUserId })
        : undefined
    ) ?? [];
  const shifts =
    useAll(
      currentUserId
        ? app.shifts.where({ $createdBy: currentUserId })
        : undefined
    ) ?? [];
  const sortedPatterns = useMemo(
    () =>
      [...patterns].sort((a, b) => {
        const orderDiff = a.orderIndex - b.orderIndex;
        return orderDiff === 0 ? a.id.localeCompare(b.id) : orderDiff;
      }),
    [patterns]
  );
  const presetsByCategory = useMemo(() => {
    const nextPresetsByCategory = new Map<
      ShiftPatternPresetCategory,
      ShiftPatternPreset[]
    >();

    for (const tab of PRESET_TABS) {
      nextPresetsByCategory.set(
        tab.value,
        SHIFT_PATTERN_PRESETS.filter((preset) => preset.category === tab.value)
      );
    }

    return nextPresetsByCategory;
  }, []);

  const handleDragEnd = useCallback<SortableGridDragEndCallback<Pattern>>(
    ({ data }) => {
      if (clearDraggingTimeoutRef.current) {
        clearTimeout(clearDraggingTimeoutRef.current);
      }
      clearDraggingTimeoutRef.current = setTimeout(() => {
        isDraggingRef.current = false;
        clearDraggingTimeoutRef.current = null;
      }, 150);

      if (!session) {
        return;
      }

      const changedPatterns = data.filter(
        (pattern, index) => pattern.orderIndex !== index
      );

      if (changedPatterns.length === 0) {
        return;
      }

      db.batch((batch) => {
        for (const [index, pattern] of data.entries()) {
          batch.update(app.patterns, pattern.id, {
            orderIndex: index,
          });
        }
      });
    },
    [db, session]
  );

  const handleDragStart = useCallback(() => {
    if (clearDraggingTimeoutRef.current) {
      clearTimeout(clearDraggingTimeoutRef.current);
      clearDraggingTimeoutRef.current = null;
    }

    isDraggingRef.current = true;
  }, []);

  const addPreset = (preset: ShiftPatternPreset) => {
    if (!session) {
      Alert.alert("作成できません", "接続後に作成できます。");
      return;
    }

    db.batch((batch) => {
      insertShiftPatternPreset(batch, preset, patterns.length);
    });
  };

  const confirmResetPatterns = () => {
    if (!session || patterns.length === 0) {
      return;
    }

    Alert.alert(
      "すべてのパターンをリセットしますか？",
      shifts.length > 0
        ? "シフトパターンだけでなく、関連する全てのシフトも削除されます。この操作は取り消せません。"
        : "すべてのシフトパターンが削除されます。この操作は取り消せません。",
      [
        { style: "cancel", text: "キャンセル" },
        {
          onPress: () => {
            deleteShiftPatternsAndRelatedData(db, {
              patterns,
              shifts,
            });
          },
          style: "destructive",
          text: "リセット",
        },
      ]
    );
  };

  const renderPattern = useCallback<SortableGridRenderItem<Pattern>>(
    ({ item }) => (
      <Button
        accessibilityLabel={`${item.name}を編集`}
        className="h-15 w-full flex-col justify-center gap-1 rounded-lg bg-foreground/5 px-1 py-2"
        isDisabled={!session}
        onPress={() => {
          if (isDraggingRef.current) {
            return;
          }

          router.push(`/patterns/${item.id}`);
        }}
        variant="ghost"
      >
        <Button.Label
          className="text-center text-sm leading-0"
          numberOfLines={1}
        >
          {item.emoji}
        </Button.Label>
        <Button.Label
          className="text-center text-sm leading-0"
          numberOfLines={1}
        >
          {item.name}
        </Button.Label>
      </Button>
    ),
    [router, session]
  );

  return (
    <Animated.ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      contentInsetAdjustmentBehavior="automatic"
      ref={scrollableRef}
      showsVerticalScrollIndicator={false}
    >
      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-3">
          <SectionTitle>現在のパターン</SectionTitle>
          <Button
            accessibilityLabel="すべてのパターンをリセット"
            className="h-9 w-9"
            isDisabled={!session || patterns.length === 0}
            isIconOnly={true}
            onPress={confirmResetPatterns}
            size="sm"
            variant="ghost"
          >
            <SymbolView
              name={{
                android: "delete",
                ios: "trash",
                web: "delete",
              }}
              size={17}
            />
          </Button>
        </View>
        {sortedPatterns.length > 0 ? (
          <Sortable.Grid
            activeItemScale={1.02}
            autoScrollEnabled={true}
            columnGap={PATTERN_GRID_GAP}
            columns={PATTERN_COLUMN_COUNT}
            data={sortedPatterns}
            hapticsEnabled={false}
            keyExtractor={(pattern) => pattern.id}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            overDrag="vertical"
            renderItem={renderPattern}
            rowGap={PATTERN_GRID_GAP}
            scrollableRef={scrollableRef}
            showDropIndicator={true}
            sortEnabled={Boolean(session)}
          />
        ) : (
          <View className="items-center justify-center rounded-lg bg-foreground/5 px-4 py-8">
            <Text className="text-center text-sm" color="muted">
              シフトパターンがありません
            </Text>
          </View>
        )}
        {session ? null : (
          <Text className="px-1 text-center text-sm" color="muted">
            接続後に編集できます
          </Text>
        )}
      </View>

      <View className="gap-2">
        <SectionTitle>シフトパターンを追加</SectionTitle>
        <Tabs
          onValueChange={(value) => {
            if (isShiftPatternPresetCategory(value)) {
              setActiveTab(value);
            }
          }}
          value={activeTab}
          variant="primary"
        >
          <Tabs.List>
            <Tabs.Indicator />
            {PRESET_TABS.map((tab) => (
              <Tabs.Trigger key={tab.value} value={tab.value}>
                <Tabs.Label>{tab.label}</Tabs.Label>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {PRESET_TABS.map((tab) => (
            <Tabs.Content className="pt-3" key={tab.value} value={tab.value}>
              {tab.value === "workstyle" ? (
                <PresetList
                  isDisabled={!session}
                  onAddPreset={addPreset}
                  presets={presetsByCategory.get(tab.value) ?? []}
                />
              ) : (
                <AddPartsGrid
                  isDisabled={!session}
                  onAddCustom={() => {
                    router.push("/patterns/new");
                  }}
                  onAddPreset={addPreset}
                  presets={presetsByCategory.get(tab.value) ?? []}
                />
              )}
            </Tabs.Content>
          ))}
        </Tabs>
      </View>
    </Animated.ScrollView>
  );
};

const isShiftPatternPresetCategory = (
  value: string
): value is ShiftPatternPresetCategory =>
  PRESET_TABS.some((tab) => tab.value === value);

type SectionTitleProps = {
  children: string;
};

const SectionTitle = ({ children }: SectionTitleProps) => (
  <Text className="px-1 font-semibold text-sm" color="muted">
    {children}
  </Text>
);

type PresetListItemProps = {
  isDisabled: boolean;
  onPress: () => void;
  preset: ShiftPatternPreset;
};

type PresetListProps = {
  isDisabled: boolean;
  onAddPreset: (preset: ShiftPatternPreset) => void;
  presets: ShiftPatternPreset[];
};

const PresetList = ({ isDisabled, onAddPreset, presets }: PresetListProps) => (
  <ListGroup>
    {presets.map((preset, index) => (
      <View key={preset.id}>
        {index > 0 ? <Separator className="mx-4" /> : null}
        <PresetListItem
          isDisabled={isDisabled}
          onPress={() => {
            onAddPreset(preset);
          }}
          preset={preset}
        />
      </View>
    ))}
  </ListGroup>
);

type AddPartsGridProps = {
  isDisabled: boolean;
  onAddCustom: () => void;
  onAddPreset: (preset: ShiftPatternPreset) => void;
  presets: ShiftPatternPreset[];
};

const AddPartsGrid = ({
  isDisabled,
  onAddCustom,
  onAddPreset,
  presets,
}: AddPartsGridProps) => (
  <View className="gap-3">
    <ListGroup>
      <ListGroup.Item
        accessibilityLabel="シフトパターンをカスタムで追加"
        disabled={isDisabled}
        onPress={onAddCustom}
      >
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle>カスタムで追加</ListGroup.ItemTitle>
          <ListGroup.ItemDescription>
            名前、時間、休み扱いを自分で設定します
          </ListGroup.ItemDescription>
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
    </ListGroup>
    <View className="flex-row flex-wrap">
      {presets.map((preset) => {
        const [pattern] = preset.patterns;

        if (!pattern) {
          return null;
        }

        return (
          <View
            className="p-1"
            key={preset.id}
            style={{ width: `${100 / PATTERN_COLUMN_COUNT}%` }}
          >
            <Button
              accessibilityLabel={`${preset.title}を追加`}
              className="h-15 w-full flex-col justify-center gap-1 rounded-lg bg-foreground/5 px-1 py-2"
              isDisabled={isDisabled}
              onPress={() => {
                onAddPreset(preset);
              }}
              variant="ghost"
            >
              <Button.Label
                className="text-center text-sm leading-0"
                numberOfLines={1}
              >
                {pattern.emoji}
              </Button.Label>
              <Button.Label
                className="text-center text-sm leading-0"
                numberOfLines={1}
              >
                {pattern.name}
              </Button.Label>
            </Button>
          </View>
        );
      })}
    </View>
  </View>
);

const PresetListItem = ({
  isDisabled,
  onPress,
  preset,
}: PresetListItemProps) => (
  <ListGroup.Item disabled={isDisabled}>
    <ListGroup.ItemContent>
      <View className="gap-3 py-1">
        <View className="flex-row items-center justify-between gap-3">
          <ListGroup.ItemTitle>{preset.title}</ListGroup.ItemTitle>
          <Button
            accessibilityLabel={`${preset.title}を追加`}
            isDisabled={isDisabled}
            onPress={onPress}
            size="sm"
            variant="outline"
          >
            <SymbolView
              name={{
                android: "add",
                ios: "plus",
                web: "add",
              }}
              size={15}
            />
            <Button.Label>追加</Button.Label>
          </Button>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {preset.patterns.map((pattern) => (
            <PatternPreviewChip
              key={`${preset.id}-${pattern.name}`}
              pattern={pattern}
            />
          ))}
        </View>
      </View>
    </ListGroup.ItemContent>
  </ListGroup.Item>
);

type PatternPreviewChipProps = {
  pattern: ShiftPatternPresetPattern;
};

const PatternPreviewChip = ({ pattern }: PatternPreviewChipProps) => (
  <View className="h-15 w-15 items-center justify-center gap-1 rounded-lg bg-foreground/5 px-1 py-2">
    <Text className="text-center text-sm leading-0" numberOfLines={1}>
      {pattern.emoji}
    </Text>
    <Text className="text-center text-sm leading-0" numberOfLines={1}>
      {pattern.name}
    </Text>
  </View>
);
