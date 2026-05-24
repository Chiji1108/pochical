import { selectionAsync } from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { Button } from "heroui-native/button";
import type { FC } from "react";
import { View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { CalendarDatePickerButton } from "@/components/calendar/calendar-date-picker-button";
import { db, type Shift } from "@/lib/instant";

const selectedDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const selectedWeekdayFormatter = new Intl.DateTimeFormat("ja-JP", {
  weekday: "short",
});

type PatternGridHeaderProps = {
  detailGestureActive: SharedValue<number>;
  detailTransitionProgress: SharedValue<number>;
  isDetailInputMode: boolean;
  isShiftInputMode: boolean;
  onSelectDate: (date: Date) => void;
  onSelectNextDay: () => void;
  onToggleShiftInputMode: () => void;
  selectedDate: Date;
  selectedDateShifts: Shift[];
};

type NextActionButtonProps = {
  hasSelectedDateShift: boolean;
  onPress: () => void;
};

const NextActionButton: FC<NextActionButtonProps> = ({
  hasSelectedDateShift,
  onPress,
}) => (
  <Button
    accessibilityLabel={
      hasSelectedDateShift ? "選択日のシフトを削除して翌日へ移動" : "翌日を選択"
    }
    onPress={onPress}
    size="sm"
    variant="outline"
  >
    <SymbolView
      name={{
        android: hasSelectedDateShift ? "delete" : "forward",
        ios: hasSelectedDateShift ? "trash" : "forward.fill",
        web: hasSelectedDateShift ? "delete" : "forward",
      }}
      size={16}
    />
    <Button.Label>{hasSelectedDateShift ? "削除" : "翌日"}</Button.Label>
  </Button>
);

export const PatternGridHeader: FC<PatternGridHeaderProps> = ({
  detailGestureActive,
  detailTransitionProgress,
  isDetailInputMode,
  isShiftInputMode,
  onSelectDate,
  onSelectNextDay,
  onToggleShiftInputMode,
  selectedDate,
  selectedDateShifts,
}) => {
  const hasSelectedDateShift = selectedDateShifts.length > 0;
  const nextActionStyle = useAnimatedStyle(() => ({
    opacity: 1 - detailTransitionProgress.value,
  }));
  const dragHandleStyle = useAnimatedStyle(() => ({
    opacity: detailGestureActive.value,
  }));

  const handleNextAction = () => {
    if (hasSelectedDateShift) {
      db.transact(
        selectedDateShifts.map((shift) => db.tx.shifts[shift.id].delete())
      ).catch(() => undefined);
    }

    onSelectNextDay();

    selectionAsync().catch(() => {
      // Haptics can be unavailable depending on the device or platform.
    });
  };

  const handleToggleShiftInputMode = () => {
    onToggleShiftInputMode();

    selectionAsync().catch(() => {
      // Haptics can be unavailable depending on the device or platform.
    });
  };

  return (
    <View className="pt-1">
      <Animated.View
        accessibilityElementsHidden
        accessible={false}
        className="items-center"
        importantForAccessibility="no-hide-descendants"
        style={dragHandleStyle}
      >
        <View className="h-1 w-10 rounded-full bg-foreground/25" />
      </Animated.View>
      <View className="flex-row items-center justify-between px-2 pb-2">
        <CalendarDatePickerButton
          onSelectDate={onSelectDate}
          size="sm"
          value={selectedDate}
          variant="ghost"
        >
          <Button.Label className="font-semibold text-base">
            {`${selectedDateFormatter.format(selectedDate)}(${selectedWeekdayFormatter.format(
              selectedDate
            )})`}
          </Button.Label>
        </CalendarDatePickerButton>
        <View className="flex-row items-center gap-2 pr-2">
          {isShiftInputMode ? (
            <Animated.View
              pointerEvents={isDetailInputMode ? "none" : "auto"}
              style={nextActionStyle}
            >
              <NextActionButton
                hasSelectedDateShift={hasSelectedDateShift}
                onPress={handleNextAction}
              />
            </Animated.View>
          ) : null}
          <Button
            accessibilityLabel={
              isShiftInputMode ? "シフト入力を完了" : "シフト入力を開始"
            }
            onPress={handleToggleShiftInputMode}
            size="sm"
            variant={isShiftInputMode ? "primary" : "outline"}
          >
            <SymbolView
              name={{
                android: isShiftInputMode ? "check" : "edit",
                ios: isShiftInputMode ? "checkmark" : "pencil",
                web: isShiftInputMode ? "check" : "edit",
              }}
              size={16}
              tintColor={isShiftInputMode ? "white" : undefined}
            />
            <Button.Label>
              {isShiftInputMode ? "完了" : "シフト入力"}
            </Button.Label>
          </Button>
        </View>
      </View>
    </View>
  );
};
