import { getDate, isSameDay, isSameMonth, isToday } from "date-fns";
import type { FC } from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "@/lib/utils";
import { WeekList } from "./week-list";
import { WeekRow } from "./week-row";

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
  <View className={className}>
    <WeekRow>
      {(date) => (
        <Text className="text-foreground text-xs">
          {date.toLocaleDateString(undefined, {
            weekday: "short",
          })}
        </Text>
      )}
    </WeekRow>
    <WeekList yearMonth={yearMonth}>
      {(date) => (
        <Pressable
          className={cn(
            "flex h-20 w-full flex-col items-center rounded-lg p-1",
            {
              "opacity-40": !isSameMonth(date, yearMonth),
              "bg-foreground": selectedDate && isSameDay(date, selectedDate),
            }
          )}
          onPress={() => {
            setSelectedDate(date);
          }}
        >
          <Text
            className={cn("text-foreground text-xs", {
              "text-background": selectedDate && isSameDay(date, selectedDate),
              "text-accent": isToday(date),
            })}
          >
            {getDate(date)}
          </Text>
        </Pressable>
      )}
    </WeekList>
  </View>
);
