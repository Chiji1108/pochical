import { selectionAsync } from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { Button } from "heroui-native/button";
import type { FC } from "react";
import { View } from "react-native";
import { CalendarDatePickerButton } from "@/components/calendar/calendar-date-picker-button";

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
  const selectNextDay = async () => {
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
        accessibilityLabel="翌日を選択"
        className="mx-2"
        onPress={selectNextDay}
        size="sm"
        variant="outline"
      >
        <SymbolView
          name={{
            android: "forward",
            ios: "forward",
            web: "forward",
          }}
          size={16}
        />
        <Button.Label>翌日</Button.Label>
      </Button>
    </View>
  );
};
