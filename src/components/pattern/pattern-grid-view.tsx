import { addDays, isSameDay, startOfDay } from "date-fns";
import { selectionAsync } from "expo-haptics";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Text } from "heroui-native";
import { Button } from "heroui-native/button";
import { useDb, useSession } from "jazz-tools/react-native";
import { type RefObject, useMemo } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  View,
} from "react-native";
import { type GestureType, ScrollView } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { ShiftDetailInputPanel } from "@/components/shift/shift-detail-input-panel";
import { app, type Pattern, type Shift, type ShiftNote } from "@/schema";

const MIN_PATTERN_CELL_WIDTH = 48;
const PATTERN_GRID_GAP = 8;

type SeedPattern = {
  countsAsDayOff?: boolean;
  emoji: string;
  end?: [hour: number, minute: number];
  isAllDay?: boolean;
  name: string;
  orderIndex: number;
  start?: [hour: number, minute: number];
  usesAkeAsNextDay?: boolean;
};

type PatternInsert = {
  countsAsDayOff: boolean;
  emoji: string;
  endDate: Date | null;
  isAllDay: boolean;
  name: string;
  nextDayPatternId?: string | null;
  orderIndex: number;
  startDate: Date | null;
};

const seedTime = ([hour, minute]: [hour: number, minute: number]): Date => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
};

const createPatternInsert = (
  pattern: SeedPattern,
  nextDayPatternId?: string
): PatternInsert => ({
  countsAsDayOff: pattern.countsAsDayOff ?? false,
  emoji: pattern.emoji,
  endDate: pattern.end ? seedTime(pattern.end) : null,
  isAllDay: pattern.isAllDay ?? false,
  name: pattern.name,
  nextDayPatternId: nextDayPatternId ?? null,
  orderIndex: pattern.orderIndex,
  startDate: pattern.start ? seedTime(pattern.start) : null,
});

const seedPatterns: SeedPattern[] = [
  { emoji: "☀️", end: [17, 30], name: "日勤", orderIndex: 0, start: [8, 30] },
  {
    emoji: "🌃",
    end: [9, 0],
    name: "夜勤",
    orderIndex: 1,
    start: [17, 0],
    usesAkeAsNextDay: true,
  },
  {
    countsAsDayOff: true,
    emoji: "🌅",
    isAllDay: true,
    name: "明け",
    orderIndex: 2,
  },
  {
    countsAsDayOff: true,
    emoji: "💤",
    isAllDay: true,
    name: "休み",
    orderIndex: 3,
  },
  { emoji: "🐰", end: [15, 0], name: "早番", orderIndex: 4, start: [7, 0] },
  { emoji: "🐢", end: [21, 0], name: "遅番", orderIndex: 5, start: [13, 0] },
  {
    emoji: "🌜",
    end: [1, 0],
    name: "準夜",
    orderIndex: 6,
    start: [16, 30],
    usesAkeAsNextDay: true,
  },
  { emoji: "🌛", end: [8, 30], name: "深夜", orderIndex: 7, start: [0, 0] },
  { emoji: "🌞", end: [19, 30], name: "日長", orderIndex: 8, start: [8, 0] },
  { emoji: "🏠", isAllDay: true, name: "待機", orderIndex: 9 },
  { emoji: "📚", end: [17, 0], name: "研修", orderIndex: 10, start: [9, 0] },
  {
    countsAsDayOff: true,
    emoji: "🎉",
    isAllDay: true,
    name: "有給",
    orderIndex: 11,
  },
] as const;

type PatternGridViewProps = {
  bottomContentPadding: number;
  detailModeGestureRef: RefObject<GestureType | undefined>;
  detailScrollOffsetY: SharedValue<number>;
  detailTransitionProgress: SharedValue<number>;
  isDetailInputMode: boolean;
  onSelectDate: (date: Date) => void;
  onSelectNextDay: () => void;
  patterns: Pattern[];
  selectedDate: Date;
  selectedDateShift?: Shift;
  selectedDateShiftNote?: ShiftNote;
  shiftNotesByShiftId: ReadonlyMap<string, ShiftNote>;
  shifts: Shift[];
};

export function PatternGridView({
  bottomContentPadding,
  detailModeGestureRef,
  detailScrollOffsetY,
  detailTransitionProgress,
  isDetailInputMode,
  onSelectDate,
  onSelectNextDay,
  patterns,
  selectedDate,
  selectedDateShift,
  selectedDateShiftNote,
  shiftNotesByShiftId,
  shifts,
}: PatternGridViewProps) {
  const db = useDb();
  const router = useRouter();
  const session = useSession();
  const { width } = useWindowDimensions();
  const sortedPatterns = useMemo(
    () => [...patterns].sort((a, b) => a.orderIndex - b.orderIndex),
    [patterns]
  );
  const columnCount = Math.max(
    1,
    Math.floor(
      (width - 32 + PATTERN_GRID_GAP) /
        (MIN_PATTERN_CELL_WIDTH + PATTERN_GRID_GAP)
    )
  );
  const cellWidth = `${100 / columnCount}%` as const;
  const detailInputStyle = useAnimatedStyle(() => ({
    opacity: detailTransitionProgress.value,
  }));

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    detailScrollOffsetY.value = event.nativeEvent.contentOffset.y;
  };

  const createSeedPatterns = () => {
    if (!session || patterns.length > 0) {
      return;
    }

    db.batch((batch) => {
      const akeSeed = seedPatterns.find((pattern) => pattern.name === "明け");

      if (!akeSeed) {
        throw new Error("明けシフトパターンの seed が見つかりません。");
      }

      const ake = batch.insert(app.patterns, createPatternInsert(akeSeed));

      for (const pattern of seedPatterns) {
        if (pattern.name === "明け") {
          continue;
        }

        batch.insert(
          app.patterns,
          createPatternInsert(
            pattern,
            pattern.usesAkeAsNextDay ? ake.id : undefined
          )
        );
      }
    });
  };

  function handlePatternPress(pattern: Pattern) {
    if (!session) {
      return;
    }

    const shiftStartDate = startOfDay(selectedDate);
    const nextShiftStartDate = addDays(shiftStartDate, 1);

    db.batch((batch) => {
      const upsertShift = (patternId: string, startDate: Date) => {
        const sameDateShifts = shifts.filter((shift) =>
          isSameDay(shift.startDate, startDate)
        );
        const [existingShift, ...duplicateShifts] = sameDateShifts;

        if (existingShift) {
          batch.update(app.shifts, existingShift.id, {
            patternId,
            startDate,
          });
        } else {
          batch.insert(app.shifts, {
            patternId,
            startDate,
            memberIds: [],
          });
        }

        for (const duplicateShift of duplicateShifts) {
          const duplicateShiftNote = shiftNotesByShiftId.get(duplicateShift.id);

          if (duplicateShiftNote) {
            batch.delete(app.shiftNotes, duplicateShiftNote.id);
          }

          batch.delete(app.shifts, duplicateShift.id);
        }
      };

      upsertShift(pattern.id, shiftStartDate);

      if (pattern.nextDayPatternId) {
        upsertShift(pattern.nextDayPatternId, nextShiftStartDate);
      }
    });

    if (!isDetailInputMode) {
      onSelectDate(addDays(shiftStartDate, pattern.nextDayPatternId ? 2 : 1));
    }

    selectionAsync().catch(() => {
      // Haptics can be unavailable depending on the device or platform.
    });
  }

  return (
    <ScrollView
      alwaysBounceVertical={false}
      bounces={false}
      className="flex-1"
      contentContainerClassName="px-3"
      contentContainerStyle={{ paddingBottom: bottomContentPadding }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      onScroll={handleScroll}
      overScrollMode="never"
      scrollEnabled={isDetailInputMode}
      scrollEventThrottle={16}
      simultaneousHandlers={detailModeGestureRef}
    >
      {sortedPatterns.length > 0 ? (
        <View className="gap-2">
          <View>
            <View className="flex-row flex-wrap">
              {sortedPatterns.map((pattern) => (
                <View
                  className="p-1"
                  key={pattern.id}
                  style={{ width: cellWidth }}
                >
                  <Button
                    accessibilityLabel={`${pattern.name}を入力`}
                    className="h-15 w-full flex-col justify-center gap-1 rounded-lg bg-foreground/5 px-1 py-2"
                    isDisabled={!session}
                    onPress={() => {
                      handlePatternPress(pattern);
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
              ))}
            </View>
          </View>
          <View className="flex-row items-center justify-end gap-2">
            <Button
              className="self-center"
              onPress={() => {
                router.push("/patterns");
              }}
              size="sm"
              variant="outline"
            >
              <SymbolView
                name={{
                  android: "edit",
                  ios: "pencil",
                  web: "edit",
                }}
                size={16}
              />
              <Button.Label>シフトパターンを編集</Button.Label>
            </Button>
          </View>
          <Animated.View
            pointerEvents={isDetailInputMode ? "auto" : "none"}
            style={detailInputStyle}
          >
            <ShiftDetailInputPanel
              onSelectNextDay={onSelectNextDay}
              selectedShift={selectedDateShift}
              selectedShiftNote={selectedDateShiftNote}
            />
          </Animated.View>
        </View>
      ) : (
        <View className="items-center py-6">
          <Button
            isDisabled={!session}
            onPress={createSeedPatterns}
            size="lg"
            variant="primary"
          >
            <SymbolView
              name={{
                android: "add",
                ios: "plus",
                web: "add",
              }}
              size={18}
              tintColor="white"
            />
            <Button.Label>シフトパターンを追加</Button.Label>
          </Button>
          {session ? null : (
            <Text className="mt-3 text-sm" color="muted">
              接続後に作成できます
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}
