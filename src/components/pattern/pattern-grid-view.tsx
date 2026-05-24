import { id } from "@instantdb/react-native";
import { addDays, isSameDay, startOfDay } from "date-fns";
import { selectionAsync } from "expo-haptics";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Text, useThemeColor } from "heroui-native";
import { Button } from "heroui-native/button";
import { useMemo } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { ShiftDetailInputPanel } from "@/components/shift/shift-detail-input-panel";
import {
  type DayNote,
  db,
  type InstantTransaction,
  type Member,
  type Pattern,
  type Shift,
  useCurrentUserId,
} from "@/lib/instant";

const MIN_PATTERN_CELL_WIDTH = 48;
const PATTERN_GRID_GAP = 8;
const ANDROID_KEYBOARD_BOTTOM_OFFSET_EXTRA = 32;

type PatternGridViewProps = {
  bottomContentPadding: number;
  detailScrollOffsetY: SharedValue<number>;
  detailTransitionProgress: SharedValue<number>;
  isDetailInputMode: boolean;
  onSelectDate: (date: Date) => void;
  onSelectNextDay: () => void;
  onShouldStayAfterShiftSaved?: (savedDates: Date[]) => boolean;
  onShiftSaved?: (date: Date) => void;
  members: Member[];
  patterns: Pattern[];
  selectedDate: Date;
  selectedDateDayNote?: DayNote;
  selectedDateShift?: Shift;
  shifts: Shift[];
};

export function PatternGridView({
  bottomContentPadding,
  detailScrollOffsetY,
  detailTransitionProgress,
  isDetailInputMode,
  onSelectDate,
  onSelectNextDay,
  onShouldStayAfterShiftSaved,
  onShiftSaved,
  members,
  patterns,
  selectedDate,
  selectedDateDayNote,
  selectedDateShift,
  shifts,
}: PatternGridViewProps) {
  const router = useRouter();
  const currentUserId = useCurrentUserId();
  const { width } = useWindowDimensions();
  const patternButtonBackgroundColor = useThemeColor("surface-secondary");
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
    if (!currentUserId) {
      return;
    }

    const shiftStartDate = startOfDay(selectedDate);
    const nextShiftStartDate = addDays(shiftStartDate, 1);

    const transactions: InstantTransaction[] = [];
    const upsertShift = (shiftPattern: Pattern, startDate: Date) => {
      const sameDateShifts = shifts.filter((shift) =>
        isSameDay(shift.startDate, startDate)
      );
      const [existingShift, ...duplicateShifts] = sameDateShifts;

      if (existingShift) {
        const currentPatternId = existingShift.pattern?.id;
        transactions.push(db.tx.shifts[existingShift.id].update({ startDate }));
        if (currentPatternId && currentPatternId !== shiftPattern.id) {
          transactions.push(
            db.tx.shifts[existingShift.id].unlink({
              pattern: currentPatternId,
            })
          );
        }
        if (currentPatternId !== shiftPattern.id) {
          transactions.push(
            db.tx.shifts[existingShift.id].link({
              pattern: shiftPattern.id,
            })
          );
        }
      } else {
        transactions.push(
          db.tx.shifts[id()]
            .create({ startDate })
            .link({ owner: currentUserId, pattern: shiftPattern.id })
        );
      }

      for (const duplicateShift of duplicateShifts) {
        transactions.push(db.tx.shifts[duplicateShift.id].delete());
      }
    };

    upsertShift(pattern, shiftStartDate);

    if (pattern.nextDayPattern) {
      const nextDayPattern =
        patternsById.get(pattern.nextDayPattern.id) ?? pattern.nextDayPattern;
      upsertShift(nextDayPattern, nextShiftStartDate);
    }

    onShiftSaved?.(shiftStartDate);

    const hasNextDayPattern = Boolean(pattern.nextDayPattern);
    const savedDates = hasNextDayPattern
      ? [shiftStartDate, nextShiftStartDate]
      : [shiftStartDate];

    if (!(isDetailInputMode || onShouldStayAfterShiftSaved?.(savedDates))) {
      onSelectDate(addDays(shiftStartDate, hasNextDayPattern ? 2 : 1));
    }

    db.transact(transactions).catch(() => undefined);

    selectionAsync().catch(() => {
      // Haptics can be unavailable depending on the device or platform.
    });
  }

  return (
    <KeyboardAwareScrollView
      alwaysBounceVertical={false}
      bottomOffset={
        bottomContentPadding +
        (Platform.OS === "android" ? ANDROID_KEYBOARD_BOTTOM_OFFSET_EXTRA : 0)
      }
      bounces={false}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: bottomContentPadding },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      enabled={isDetailInputMode}
      keyboardShouldPersistTaps="handled"
      mode="layout"
      onScroll={handleScroll}
      overScrollMode="never"
      scrollEnabled={isDetailInputMode}
      scrollEventThrottle={16}
      style={styles.flex}
    >
      {sortedPatterns.length > 0 ? (
        <View style={styles.patternSection}>
          <View>
            <View style={styles.patternGrid}>
              {sortedPatterns.map((pattern) => (
                <View
                  key={pattern.id}
                  style={[styles.patternCell, { width: cellWidth }]}
                >
                  <Button
                    accessibilityLabel={`${pattern.name}を入力`}
                    isDisabled={!currentUserId}
                    onPress={() => {
                      handlePatternPress(pattern);
                    }}
                    style={[
                      styles.patternButton,
                      { backgroundColor: patternButtonBackgroundColor },
                    ]}
                    variant="ghost"
                  >
                    <Button.Label
                      numberOfLines={1}
                      style={styles.patternEmojiLabel}
                    >
                      {pattern.emoji}
                    </Button.Label>
                    <Button.Label
                      numberOfLines={1}
                      style={styles.patternNameLabel}
                    >
                      {pattern.name}
                    </Button.Label>
                  </Button>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.actionsRow}>
            <Button
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
              members={members}
              onSelectNextDay={onSelectNextDay}
              selectedDate={selectedDate}
              selectedDateDayNote={selectedDateDayNote}
              selectedShift={selectedDateShift}
            />
          </Animated.View>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Button
            isDisabled={!currentUserId}
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
          {currentUserId ? null : (
            <Text color="muted" style={styles.signedOutHint}>
              接続後に作成できます
            </Text>
          )}
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
  },
  flex: {
    flex: 1,
  },
  patternButton: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "column",
    gap: 4,
    height: 60,
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 8,
    width: "100%",
  },
  patternCell: {
    padding: 4,
  },
  patternEmojiLabel: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  patternGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  patternNameLabel: {
    fontSize: 14,
    lineHeight: 14,
    textAlign: "center",
  },
  patternSection: {
    gap: 8,
  },
  scrollContent: {
    paddingHorizontal: 12,
  },
  signedOutHint: {
    fontSize: 14,
    marginTop: 12,
  },
});
