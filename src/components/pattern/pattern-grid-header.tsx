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
  onSelectDate: (date: Date) => void;
  onSelectNextDay: () => void;
  selectedDate: Date;
};

export const PatternGridHeader: FC<PatternGridHeaderProps> = ({
  onSelectDate,
  onSelectNextDay,
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

  return (
    <View className="flex-row items-center justify-between px-2 pt-1">
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
      <Button
        accessibilityLabel={
          hasSelectedDateShift
            ? "選択日のシフトを削除して翌日へ移動"
            : "翌日を選択"
        }
        className="mx-2"
        onPress={handleNextAction}
        size="sm"
        variant="outline"
      >
        <SymbolView
          name={{
            android: hasSelectedDateShift ? "delete" : "forward",
            ios: hasSelectedDateShift ? "trash" : "forward",
            web: hasSelectedDateShift ? "delete" : "forward",
          }}
          size={16}
        />
        <Button.Label>{hasSelectedDateShift ? "削除" : "翌日"}</Button.Label>
      </Button>
    </View>
  );
};
