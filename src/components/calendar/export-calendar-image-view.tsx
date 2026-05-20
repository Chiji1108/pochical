import { Text } from "heroui-native";
import type { FC } from "react";
import { View } from "react-native";
import type { CalendarHighlightTarget, WeekStartsOn } from "@/lib/app-settings";
import { getCalendarWeekdayHighlightColor } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Pattern } from "@/schema";
import { CalendarBody, type CalendarShiftSummary } from "./calendar-body";
import { WeekRow } from "./week-row";

type ExportCalendarImageViewProps = {
  calendarHighlightTargets: CalendarHighlightTarget[];
  monthLabel: string;
  patternsById: ReadonlyMap<string, Pattern>;
  shiftsByDate: ReadonlyMap<number, CalendarShiftSummary>;
  weekStartsOn: WeekStartsOn;
  yearMonth: Date;
};

const ignoreDateSelection = (_date: Date) => undefined;

export const ExportCalendarImageView: FC<ExportCalendarImageViewProps> = ({
  calendarHighlightTargets,
  monthLabel,
  patternsById,
  shiftsByDate,
  weekStartsOn,
  yearMonth,
}) => (
  <View className="bg-background px-5 pt-5 pb-4">
    <View className="gap-4">
      <View className="flex-row items-end justify-between gap-3">
        <Text className="font-bold text-2xl leading-8">{monthLabel}</Text>
        <Text className="font-semibold text-foreground/50 text-xs">
          ナースシフト
        </Text>
      </View>
      <View className="gap-2">
        <WeekRow className="px-2" weekStartsOn={weekStartsOn}>
          {(date) => {
            const highlightColor = getCalendarWeekdayHighlightColor(
              date,
              calendarHighlightTargets
            );

            return (
              <Text
                className={cn("font-semibold text-foreground/55 text-xs", {
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
        <CalendarBody
          calendarHighlightTargets={calendarHighlightTargets}
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
