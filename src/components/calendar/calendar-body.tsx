import { getDate, isSameDay, isSameMonth, isToday, startOfDay } from "date-fns";
import { selectionAsync } from "expo-haptics";
import { PressableFeedback, Text } from "heroui-native";
import { useAll } from "jazz-tools/react-native";
import type { FC } from "react";
import { useMemo } from "react";
import { View } from "react-native";
import { isJapaneseHoliday } from "@/lib/date";
import { cn } from "@/lib/utils";
import { app, type Pattern } from "@/schema";
import { CALENDAR_DAY_CELL_HEIGHT } from "./constants";
import { WeekList } from "./week-list";

type CalendarBodyProps = {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  yearMonth: Date;
  className?: string;
};

export const CalendarBody: FC<CalendarBodyProps> = ({
  yearMonth,
  selectedDate,
  setSelectedDate,
  className,
}) => {
  const patterns = useAll(app.patterns) ?? [];
  const shifts = useAll(app.shifts) ?? [];
  const patternsById = useMemo(() => {
    const nextPatternsById = new Map<string, Pattern>();

    for (const pattern of patterns) {
      nextPatternsById.set(pattern.id, pattern);
    }

    return nextPatternsById;
  }, [patterns]);
  const shiftsByDate = useMemo(() => {
    const nextShiftsByDate = new Map<number, string>();

    for (const shift of shifts) {
      nextShiftsByDate.set(
        startOfDay(shift.startDate).getTime(),
        shift.patternId
      );
    }

    return nextShiftsByDate;
  }, [shifts]);

  return (
    <View className={cn("px-2", className)}>
      <WeekList yearMonth={yearMonth}>
        {(date) => {
          const isSelectedDate = isSameDay(date, selectedDate);
          const shiftPatternId = shiftsByDate.get(startOfDay(date).getTime());
          const shiftPattern = shiftPatternId
            ? patternsById.get(shiftPatternId)
            : undefined;

          return (
            <PressableFeedback
              className={cn(
                "flex w-full flex-col items-center rounded-lg p-1",
                {
                  "opacity-40": !isSameMonth(date, yearMonth),
                  "bg-foreground/5": isToday(date),
                  "bg-foreground": isSelectedDate,
                }
              )}
              onPress={async () => {
                setSelectedDate(date);

                try {
                  await selectionAsync();
                } catch {
                  // Haptics can be unavailable depending on the device or platform.
                }
              }}
              style={{ height: CALENDAR_DAY_CELL_HEIGHT }}
            >
              <Text
                className={cn("text-xs", {
                  "text-red-500": isJapaneseHoliday(date),
                  "text-background": isSelectedDate,
                })}
              >
                {getDate(date)}
              </Text>
              {shiftPattern ? (
                <View className="min-w-0 flex-1 items-center justify-center">
                  <Text className="text-center text-lg" numberOfLines={1}>
                    {shiftPattern.emoji}
                  </Text>
                  <Text
                    className={cn("w-full text-center text-xs leading-0", {
                      "text-background": isSelectedDate,
                    })}
                    numberOfLines={1}
                  >
                    {shiftPattern.name}
                  </Text>
                </View>
              ) : null}
            </PressableFeedback>
          );
        }}
      </WeekList>
    </View>
  );
};
