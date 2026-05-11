import { getDate, isSameDay, isSameMonth, isToday } from "date-fns";
import { selectionAsync } from "expo-haptics";
import type { FC } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/app-text";
import { isJapaneseHoliday } from "@/lib/date";
import { cn } from "@/lib/utils";
import { CALENDAR_DAY_CELL_HEIGHT } from "./constants";
import { WeekList } from "./week-list";

type CalendarBodyProps = {
  selectedDate?: Date;
  setSelectedDate: (date: Date) => void;
  yearMonth: Date;
  className?: string;
};

export const CalendarBody: FC<CalendarBodyProps> = ({
  yearMonth,
  selectedDate,
  setSelectedDate,
  className,
}) => (
  <View className={cn("px-2", className)}>
    <WeekList yearMonth={yearMonth}>
      {(date) => (
        <Pressable
          className={cn("flex w-full flex-col items-center rounded-lg p-1", {
            "opacity-40": !isSameMonth(date, yearMonth),
            "bg-foreground/5": isToday(date),
            "bg-foreground": selectedDate && isSameDay(date, selectedDate),
          })}
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
          <AppText
            className={cn("text-xs", {
              "text-red-500": isJapaneseHoliday(date),
              "text-background": selectedDate && isSameDay(date, selectedDate),
            })}
          >
            {getDate(date)}
          </AppText>
        </Pressable>
      )}
    </WeekList>
  </View>
);
