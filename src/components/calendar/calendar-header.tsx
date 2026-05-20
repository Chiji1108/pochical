import { isSameMonth, isToday } from "date-fns";
import { selectionAsync } from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { Text } from "heroui-native";
import { Button } from "heroui-native/button";
import type { FC } from "react";
import { View } from "react-native";
import type { CalendarHighlightTarget, WeekStartsOn } from "@/lib/app-settings";
import { getCalendarWeekdayHighlightColor } from "@/lib/date";
import { cn } from "@/lib/utils";
import { CalendarDatePickerButton } from "./calendar-date-picker-button";
import { WeekRow } from "./week-row";

type CalendarHeaderProps = {
  calendarHighlightTargets: CalendarHighlightTarget[];
  onOpenExport?: () => void;
  onSelectDate: (date: Date) => void;
  onPressToday: () => void;
  selectedDate: Date;
  weekStartsOn: WeekStartsOn;
  yearMonth: Date;
  className?: string;
};

type CalendarHeaderContentProps = {
  calendarHighlightTargets: CalendarHighlightTarget[];
  canReturnToToday: boolean;
  className?: string;
  onOpenExport?: () => void;
  onPressToday: () => void;
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
  weekStartsOn: WeekStartsOn;
  yearMonth: Date;
};

const CalendarHeaderContent: FC<CalendarHeaderContentProps> = ({
  calendarHighlightTargets,
  canReturnToToday,
  className,
  onOpenExport,
  onPressToday,
  onSelectDate,
  selectedDate,
  weekStartsOn,
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
        {onOpenExport ? (
          <Button
            accessibilityLabel="書き出し画面を開く"
            className="h-10 w-10"
            isIconOnly
            onPress={async () => {
              onOpenExport();

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
              name={{
                android: "ios_share",
                ios: "square.and.arrow.up",
                web: "ios_share",
              }}
              size={18}
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
            size={18}
          />
          <Button.Label>今日</Button.Label>
        </Button>
      </View>
    </View>
    <WeekRow weekStartsOn={weekStartsOn}>
      {(date) => {
        const highlightColor = getCalendarWeekdayHighlightColor(
          date,
          calendarHighlightTargets
        );

        return (
          <Text
            className={cn("font-semibold text-xs", {
              "text-blue-500": highlightColor === "blue",
              "text-red-500": highlightColor === "red",
            })}
          >
            {date.toLocaleDateString("ja-JP", {
              weekday: "short",
            })}
          </Text>
        );
      }}
    </WeekRow>
  </View>
);

export const CalendarHeader: FC<CalendarHeaderProps> = ({
  calendarHighlightTargets,
  onOpenExport,
  onSelectDate,
  onPressToday,
  selectedDate,
  weekStartsOn,
  yearMonth,
  className,
}) => {
  const today = new Date();
  const canReturnToToday = !(
    isSameMonth(yearMonth, today) && isToday(selectedDate)
  );

  return (
    <CalendarHeaderContent
      calendarHighlightTargets={calendarHighlightTargets}
      canReturnToToday={canReturnToToday}
      className={className}
      onOpenExport={onOpenExport}
      onPressToday={onPressToday}
      onSelectDate={onSelectDate}
      selectedDate={selectedDate}
      weekStartsOn={weekStartsOn}
      yearMonth={yearMonth}
    />
  );
};
