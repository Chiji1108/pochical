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
import { app, type DayNote, type Pattern, type Shift } from "@/schema";

const MIN_PATTERN_CELL_WIDTH = 48;
const PATTERN_GRID_GAP = 8;

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
  selectedDateDayNote?: DayNote;
  selectedDateShift?: Shift;
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
  selectedDateDayNote,
  selectedDateShift,
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
  const patternsById = useMemo(
    () => new Map(patterns.map((item) => [item.id, item])),
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
          batch.delete(app.shifts, duplicateShift.id);
        }
      };

      upsertShift(pattern.id, shiftStartDate);

      if (
        pattern.nextDayPatternId &&
        patternsById.has(pattern.nextDayPatternId)
      ) {
        upsertShift(pattern.nextDayPatternId, nextShiftStartDate);
      } else if (pattern.nextDayPatternId) {
        batch.update(app.patterns, pattern.id, {
          nextDayPatternId: null,
        });
      }
    });

    if (!isDetailInputMode) {
      const hasNextDayPattern =
        pattern.nextDayPatternId && patternsById.has(pattern.nextDayPatternId);
      onSelectDate(addDays(shiftStartDate, hasNextDayPattern ? 2 : 1));
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
              selectedDate={selectedDate}
              selectedDateDayNote={selectedDateDayNote}
              selectedShift={selectedDateShift}
            />
          </Animated.View>
        </View>
      ) : (
        <View className="items-center py-6">
          <Button
            isDisabled={!session}
            onPress={() => {
              router.push("/patterns");
            }}
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
