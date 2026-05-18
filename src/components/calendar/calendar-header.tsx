import { isSameMonth, isToday } from "date-fns";
import { selectionAsync } from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { Text } from "heroui-native";
import { Button } from "heroui-native/button";
import type { FC } from "react";
import { View } from "react-native";
import { cn } from "@/lib/utils";
import { CalendarDatePickerButton } from "./calendar-date-picker-button";
import { WeekRow } from "./week-row";

type CalendarHeaderProps = {
  isExportingMonth?: boolean;
  monthlyShiftCount?: number;
  onExportMonth?: () => void;
  onSelectDate: (date: Date) => void;
  onPressToday: () => void;
  selectedDate: Date;
  yearMonth: Date;
  className?: string;
};

type CalendarHeaderContentProps = {
  canReturnToToday: boolean;
  className?: string;
  isExportingMonth?: boolean;
  monthlyShiftCount?: number;
  onExportMonth?: () => void;
  onPressToday: () => void;
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
  yearMonth: Date;
};

const CalendarHeaderContent: FC<CalendarHeaderContentProps> = ({
  canReturnToToday,
  className,
  isExportingMonth,
  monthlyShiftCount = 0,
  onExportMonth,
  onPressToday,
  onSelectDate,
  selectedDate,
  yearMonth,
}) => (
  <View className={cn("flex flex-col gap-1 px-2", className)}>
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
      <View className="mx-2 flex-row items-center gap-1">
        {onExportMonth ? (
          <Button
            accessibilityLabel="表示月のシフトをカレンダーに書き出す"
            className="h-9 w-9"
            isDisabled={isExportingMonth || monthlyShiftCount === 0}
            isIconOnly
            onPress={onExportMonth}
            size="sm"
            variant="ghost"
          >
            <SymbolView
              name={{
                android: "calendar_month",
                ios: "square.and.arrow.up",
                web: "calendar_month",
              }}
              size={16}
            />
          </Button>
        ) : null}
        <Button
          accessibilityLabel="今日に戻る"
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
          variant="ghost"
        >
          <SymbolView
            name={{ android: "undo", ios: "arrow.uturn.backward", web: "undo" }}
            size={16}
          />
          <Button.Label>今日</Button.Label>
        </Button>
      </View>
    </View>
    <WeekRow>
      {(date) => (
        <Text className="font-semibold text-xs">
          {date.toLocaleDateString("ja-JP", {
            weekday: "short",
          })}
        </Text>
      )}
    </WeekRow>
  </View>
);

export const CalendarHeader: FC<CalendarHeaderProps> = ({
  isExportingMonth,
  monthlyShiftCount,
  onExportMonth,
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
      isExportingMonth={isExportingMonth}
      monthlyShiftCount={monthlyShiftCount}
      onExportMonth={onExportMonth}
      onPressToday={onPressToday}
      onSelectDate={onSelectDate}
      selectedDate={selectedDate}
      yearMonth={yearMonth}
    />
  );
};
