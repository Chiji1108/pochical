import { format } from "date-fns";
import { Text } from "heroui-native";
import type { FC } from "react";
import { View } from "react-native";
import type { CalendarHighlightTarget, WeekStartsOn } from "@/lib/app-settings";
import { getCalendarWeekdayHighlightColor } from "@/lib/date";
import type { Pattern } from "@/lib/instant";
import { cn } from "@/lib/utils";
import {
  CalendarBody,
  type CalendarShiftSummary,
  type ExportCalendarColorScheme,
} from "./calendar-body";
import { WeekRow } from "./week-row";

type ExportCalendarImageViewProps = {
  calendarHighlightTargets: CalendarHighlightTarget[];
  colorScheme: ExportCalendarColorScheme;
  patternsById: ReadonlyMap<string, Pattern>;
  shiftsByDate: ReadonlyMap<number, CalendarShiftSummary>;
  weekStartsOn: WeekStartsOn;
  yearMonth: Date;
};

const ignoreDateSelection = (_date: Date) => undefined;

export const ExportCalendarImageView: FC<ExportCalendarImageViewProps> = ({
  calendarHighlightTargets,
  colorScheme,
  patternsById,
  shiftsByDate,
  weekStartsOn,
  yearMonth,
}) => (
  <View
    className={cn("p-5", {
      "bg-white": colorScheme === "light",
      "bg-zinc-900": colorScheme === "dark",
    })}
  >
    <View className="gap-2">
      <View className="items-center">
        <Text
          className={cn("font-bold text-2xl leading-8", {
            "text-zinc-50": colorScheme === "dark",
            "text-zinc-950": colorScheme === "light",
          })}
        >
          {format(yearMonth, "yyyy.M")}
        </Text>
      </View>
      <View>
        <WeekRow weekStartsOn={weekStartsOn}>
          {(date) => {
            const highlightColor = getCalendarWeekdayHighlightColor(
              date,
              calendarHighlightTargets
            );

            return (
              <Text
                className={cn(
                  "font-semibold text-xs",
                  {
                    "text-zinc-400": colorScheme === "dark",
                    "text-zinc-500": colorScheme === "light",
                  },
                  {
                    "text-blue-500": highlightColor === "blue",
                    "text-red-500": highlightColor === "red",
                  }
                )}
              >
                {date.toLocaleDateString("ja-JP", {
                  weekday: "short",
                })}
              </Text>
            );
          }}
        </WeekRow>
        <CalendarBody
          calendarHighlightTargets={calendarHighlightTargets}
          className="px-0"
          exportColorScheme={colorScheme}
          hideOutOfMonthDates
          isExportMode
          patternsById={patternsById}
          selectedDate={yearMonth}
          setSelectedDate={ignoreDateSelection}
          shiftsByDate={shiftsByDate}
          weekStartsOn={weekStartsOn}
          yearMonth={yearMonth}
        />
      </View>
    </View>
  </View>
);
