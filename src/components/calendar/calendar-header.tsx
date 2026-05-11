import { isSameMonth, isToday } from "date-fns";
import { selectionAsync } from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { Button } from "heroui-native/button";
import type { FC } from "react";
import { View } from "react-native";
import { AppText } from "@/components/app-text";
import { cn } from "@/lib/utils";
import { CalendarDatePickerButton } from "./calendar-date-picker-button";
import { WeekRow } from "./week-row";

type CalendarHeaderProps = {
  onSelectDate: (date: Date) => void;
  onPressToday: () => void;
  selectedDate: Date;
  yearMonth: Date;
  className?: string;
};

type CalendarHeaderContentProps = {
  canReturnToToday: boolean;
  className?: string;
  onPressToday: () => void;
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
  yearMonth: Date;
};

const CalendarHeaderContent: FC<CalendarHeaderContentProps> = ({
  canReturnToToday,
  className,
  onPressToday,
  onSelectDate,
  selectedDate,
  yearMonth,
}) => (
  <View className={cn("flex flex-col gap-2 px-2 pt-4", className)}>
    <View className="flex flex-row items-center justify-between">
      <CalendarDatePickerButton
        onSelectDate={onSelectDate}
        value={selectedDate}
        variant="ghost"
      >
        <Button.Label className="font-bold text-4xl leading-tight">
          {yearMonth.getMonth() + 1}
        </Button.Label>
      </CalendarDatePickerButton>
      <Button
        accessibilityLabel="今日に戻る"
        className="mx-2"
        isDisabled={!canReturnToToday}
        onPress={async () => {
          onPressToday();

          try {
            await selectionAsync();
          } catch {
            // Haptics can be unavailable depending on the device or platform.
          }
        }}
        size="sm"
        variant="outline"
      >
        <SymbolView
          name={{ android: "undo", ios: "arrow.uturn.backward", web: "undo" }}
          size={16}
        />
        <Button.Label>今日</Button.Label>
      </Button>
    </View>
    <WeekRow>
      {(date) => (
        <AppText className="text-xs">
          {date.toLocaleDateString("ja-JP", {
            weekday: "short",
          })}
        </AppText>
      )}
    </WeekRow>
  </View>
);

export const CalendarHeader: FC<CalendarHeaderProps> = ({
  onSelectDate,
  onPressToday,
  selectedDate,
  yearMonth,
  className,
}) => {
  const today = new Date();
  const canReturnToToday = !(
    isSameMonth(yearMonth, today) && isToday(selectedDate)
  );

  return (
    <CalendarHeaderContent
      canReturnToToday={canReturnToToday}
      className={className}
      onPressToday={onPressToday}
      onSelectDate={onSelectDate}
      selectedDate={selectedDate}
      yearMonth={yearMonth}
    />
  );
};
