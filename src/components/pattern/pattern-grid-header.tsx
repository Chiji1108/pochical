import { isSameDay } from "date-fns";
import { selectionAsync } from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { Button } from "heroui-native/button";
import { useAll, useDb } from "jazz-tools/react-native";
import type { FC } from "react";
import { View } from "react-native";
import { CalendarDatePickerButton } from "@/components/calendar/calendar-date-picker-button";
import { app } from "@/schema";

const selectedDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const selectedWeekdayFormatter = new Intl.DateTimeFormat("ja-JP", {
  weekday: "short",
});

type PatternGridHeaderProps = {
  isShiftInputMode: boolean;
  onSelectDate: (date: Date) => void;
  onSelectNextDay: () => void;
  onToggleShiftInputMode: () => void;
  selectedDate: Date;
};

export const PatternGridHeader: FC<PatternGridHeaderProps> = ({
  isShiftInputMode,
  onSelectDate,
  onSelectNextDay,
  onToggleShiftInputMode,
  selectedDate,
}) => {
  const db = useDb();
  const shifts = useAll(app.shifts) ?? [];
  const selectedDateShifts = shifts.filter((shift) =>
    isSameDay(shift.startDate, selectedDate)
  );
  const hasSelectedDateShift = selectedDateShifts.length > 0;

  const handleNextAction = async () => {
    if (hasSelectedDateShift) {
      db.batch((batch) => {
        for (const shift of selectedDateShifts) {
          batch.delete(app.shifts, shift.id);
        }
      });
    }

    onSelectNextDay();

    try {
      await selectionAsync();
    } catch {
      // Haptics can be unavailable depending on the device or platform.
    }
  };

  const handleToggleShiftInputMode = async () => {
    onToggleShiftInputMode();

    try {
      await selectionAsync();
    } catch {
      // Haptics can be unavailable depending on the device or platform.
    }
  };

  return (
    <View className="flex-row items-center justify-between px-2 py-2">
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
          <Button
            accessibilityLabel={
              hasSelectedDateShift
                ? "選択日のシフトを削除して翌日へ移動"
                : "翌日を選択"
            }
            onPress={handleNextAction}
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
            <Button.Label>
              {hasSelectedDateShift ? "削除" : "翌日"}
            </Button.Label>
          </Button>
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
  );
};
