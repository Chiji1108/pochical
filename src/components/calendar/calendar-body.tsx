import {
  getDate,
  isSameDay,
  isSameMonth,
  isSameWeek,
  isToday,
  startOfDay,
} from "date-fns";
import { selectionAsync } from "expo-haptics";
import { Text } from "heroui-native";
import type { FC, ReactNode } from "react";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import type { CalendarHighlightTarget, WeekStartsOn } from "@/lib/app-settings";
import { getCalendarDateHighlightColor, getWeeksOfMonth } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Pattern } from "@/schema";
import { CALENDAR_DAY_CELL_HEIGHT } from "./constants";
import { WeekRow } from "./week-row";

export type CalendarShiftSummary = {
  hasNotes: boolean;
  patternId: string;
};

type CalendarBodyProps = {
  calendarHighlightTargets: CalendarHighlightTarget[];
  detailTransitionProgress?: SharedValue<number>;
  patternsById: ReadonlyMap<string, Pattern>;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  shiftsByDate: ReadonlyMap<number, CalendarShiftSummary>;
  weekStartsOn: WeekStartsOn;
  yearMonth: Date;
  className?: string;
  weekDate?: Date;
};

export const CalendarBody: FC<CalendarBodyProps> = ({
  calendarHighlightTargets,
  detailTransitionProgress,
  patternsById,
  yearMonth,
  selectedDate,
  setSelectedDate,
  shiftsByDate,
  weekStartsOn,
  className,
  weekDate,
}) => {
  const fallbackProgress = useSharedValue(0);
  const transitionProgress = detailTransitionProgress ?? fallbackProgress;
  const weeks = useMemo(
    () => getWeeksOfMonth(yearMonth, { weekStartsOn }),
    [weekStartsOn, yearMonth]
  );
  const selectedWeekIndex = Math.max(
    0,
    weeks.findIndex((week) => isSameWeek(week, selectedDate, { weekStartsOn }))
  );
  const monthContentStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY:
            -selectedWeekIndex *
            CALENDAR_DAY_CELL_HEIGHT *
            transitionProgress.value,
        },
      ],
    }),
    [selectedWeekIndex, transitionProgress]
  );

  const renderDateCell = (date: Date, shouldDimOutOfMonth: boolean) => {
    const isSelectedDate = isSameDay(date, selectedDate);
    const highlightColor = getCalendarDateHighlightColor(
      date,
      calendarHighlightTargets
    );
    const shift = shiftsByDate.get(startOfDay(date).getTime());
    const shiftPattern = shift ? patternsById.get(shift.patternId) : undefined;
    return (
      <Pressable
        className={cn(
          "relative flex w-full flex-col items-center rounded-lg p-1",
          {
            "opacity-40": shouldDimOutOfMonth && !isSameMonth(date, yearMonth),
            "bg-foreground/5": isToday(date),
            "bg-foreground/85": isSelectedDate,
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
        {shift?.hasNotes ? (
          <View
            className={cn(
              "absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full",
              {
                "bg-background": isSelectedDate,
                "bg-foreground/70": !isSelectedDate,
              }
            )}
          />
        ) : null}
        <Text
          className={cn("font-semibold text-xs", {
            "text-blue-500": !isSelectedDate && highlightColor === "blue",
            "text-background": isSelectedDate,
            "text-red-500": !isSelectedDate && highlightColor === "red",
          })}
        >
          {getDate(date)}
        </Text>
        {shiftPattern ? (
          <View className="min-w-0 flex-1 items-center justify-center">
            <Text className="text-center text-sm" numberOfLines={1}>
              {shiftPattern.emoji}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View className={cn("px-2", className)}>
      {weekDate ? (
        <WeekRow date={weekDate} weekStartsOn={weekStartsOn}>
          {(date) => renderDateCell(date, false)}
        </WeekRow>
      ) : (
        <Animated.View style={monthContentStyle}>
          {weeks.map((week) => (
            <CalendarAnimatedWeekRow
              isSelectedWeek={isSameWeek(week, selectedDate, { weekStartsOn })}
              key={week.toISOString()}
              progress={transitionProgress}
              week={week}
              weekStartsOn={weekStartsOn}
            >
              {(date) => renderDateCell(date, true)}
            </CalendarAnimatedWeekRow>
          ))}
        </Animated.View>
      )}
    </View>
  );
};

type CalendarAnimatedWeekRowProps = {
  children: (date: Date) => ReactNode;
  isSelectedWeek: boolean;
  progress: SharedValue<number>;
  week: Date;
  weekStartsOn: WeekStartsOn;
};

const CalendarAnimatedWeekRow: FC<CalendarAnimatedWeekRowProps> = ({
  children,
  isSelectedWeek,
  progress,
  week,
  weekStartsOn,
}) => {
  const rowStyle = useAnimatedStyle(
    () => ({
      opacity: isSelectedWeek ? 1 : 1 - progress.value,
    }),
    [isSelectedWeek, progress]
  );

  return (
    <Animated.View style={rowStyle}>
      <WeekRow date={week} weekStartsOn={weekStartsOn}>
        {children}
      </WeekRow>
    </Animated.View>
  );
};
