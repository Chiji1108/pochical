import { format } from "date-fns";
import { Typography } from "heroui-native";
import type { FC } from "react";
import { View } from "react-native";
import type { CalendarHighlightTarget, WeekStartsOn } from "@/lib/app-settings";
import { getCalendarWeekdayHighlightColor } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Pattern } from "@/lib/work-data";
import {
  CalendarBody,
  type CalendarShiftSummary,
  type ExportCalendarColorScheme,
} from "./calendar-body";
import { WeekRow } from "./week-row";

type ExportCalendarImageViewProps = {
  calendarHighlightTargets: CalendarHighlightTarget[];
  colorScheme: ExportCalendarColorScheme;
  emojiOnly?: boolean;
  patternsById: ReadonlyMap<string, Pattern>;
  shiftsByDate: ReadonlyMap<number, CalendarShiftSummary>;
  highlightDayOffShifts?: boolean;
  weekStartsOn: WeekStartsOn;
  yearMonth: Date;
};

const ignoreDateSelection = (_date: Date) => undefined;

export const ExportCalendarImageView: FC<ExportCalendarImageViewProps> = ({
  calendarHighlightTargets,
  colorScheme,
  emojiOnly = false,
  patternsById,
  shiftsByDate,
  highlightDayOffShifts = true,
  weekStartsOn,
  yearMonth,
}) => (
  <View
    className={cn("p-5", {
      "bg-white": colorScheme === "light",
      "bg-[#242429]": colorScheme === "dark",
    })}
  >
    <View className="gap-2">
      <View className="items-center">
        <Typography
          className={cn("font-bold text-2xl leading-8", {
            "text-zinc-200": colorScheme === "dark",
            "text-zinc-950": colorScheme === "light",
          })}
        >
          {format(yearMonth, "yyyy.M")}
        </Typography>
      </View>
      <View>
        <WeekRow weekStartsOn={weekStartsOn}>
          {(date) => {
            const highlightColor = getCalendarWeekdayHighlightColor(
              date,
              calendarHighlightTargets
            );

            return (
              <Typography
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
              </Typography>
            );
          }}
        </WeekRow>
        <CalendarBody
          calendarHighlightTargets={calendarHighlightTargets}
          className="px-0"
          emojiOnly={emojiOnly}
          exportColorScheme={colorScheme}
          hideOutOfMonthDates
          highlightDayOffShifts={highlightDayOffShifts}
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
