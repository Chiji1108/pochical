import {
  getDate,
  isSameDay,
  isSameMonth,
  isSameWeek,
  isToday,
  startOfDay,
} from "date-fns";
import { selectionAsync } from "expo-haptics";
import { PressableFeedback, Text } from "heroui-native";
import type { FC, ReactNode } from "react";
import { useMemo } from "react";
import { View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { getWeeksOfMonth, isJapaneseHoliday } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Pattern } from "@/schema";
import { CALENDAR_DAY_CELL_HEIGHT } from "./constants";
import { WeekRow } from "./week-row";

export type CalendarShiftSummary = {
  hasNotes: boolean;
  patternId: string;
};

type CalendarBodyProps = {
  detailTransitionProgress?: SharedValue<number>;
  patternsById: ReadonlyMap<string, Pattern>;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  shiftsByDate: ReadonlyMap<number, CalendarShiftSummary>;
  yearMonth: Date;
  className?: string;
  weekDate?: Date;
};

export const CalendarBody: FC<CalendarBodyProps> = ({
  detailTransitionProgress,
  patternsById,
  yearMonth,
  selectedDate,
  setSelectedDate,
  shiftsByDate,
  className,
  weekDate,
}) => {
  const fallbackProgress = useSharedValue(0);
  const transitionProgress = detailTransitionProgress ?? fallbackProgress;
  const weeks = useMemo(() => getWeeksOfMonth(yearMonth), [yearMonth]);
  const selectedWeekIndex = Math.max(
    0,
    weeks.findIndex((week) => isSameWeek(week, selectedDate))
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
    const shift = shiftsByDate.get(startOfDay(date).getTime());
    const shiftPattern = shift ? patternsById.get(shift.patternId) : undefined;
    const shouldShowStandaloneNotesIndicator =
      Boolean(shift?.hasNotes) && !shiftPattern;

    return (
      <PressableFeedback
        className={cn("flex w-full flex-col items-center rounded-lg p-1", {
          "opacity-40": shouldDimOutOfMonth && !isSameMonth(date, yearMonth),
          "bg-foreground/5": isToday(date),
          "bg-foreground/85": isSelectedDate,
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
        <Text
          className={cn("font-semibold text-xs", {
            "text-red-500": isJapaneseHoliday(date),
            "text-background": isSelectedDate,
          })}
        >
          {getDate(date)}
        </Text>
        {shiftPattern ? (
          <View className="min-w-0 flex-1 items-center justify-center">
            <Text className="text-center text-sm" numberOfLines={1}>
              {shiftPattern.emoji}
            </Text>
            {shift.hasNotes ? (
              <View
                className={cn("mt-0.5 h-1.5 w-1.5 rounded-full", {
                  "bg-background": isSelectedDate,
                  "bg-foreground/70": !isSelectedDate,
                })}
              />
            ) : null}
          </View>
        ) : null}
        {shouldShowStandaloneNotesIndicator ? (
          <View
            className={cn("mt-1 h-1.5 w-1.5 rounded-full", {
              "bg-background": isSelectedDate,
              "bg-foreground/70": !isSelectedDate,
            })}
          />
        ) : null}
      </PressableFeedback>
    );
  };

  return (
    <View className={cn("px-2", className)}>
      {weekDate ? (
        <WeekRow date={weekDate}>
          {(date) => renderDateCell(date, false)}
        </WeekRow>
      ) : (
        <Animated.View style={monthContentStyle}>
          {weeks.map((week) => (
            <CalendarAnimatedWeekRow
              isSelectedWeek={isSameWeek(week, selectedDate)}
              key={week.toISOString()}
              progress={transitionProgress}
              week={week}
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
};

const CalendarAnimatedWeekRow: FC<CalendarAnimatedWeekRowProps> = ({
  children,
  isSelectedWeek,
  progress,
  week,
}) => {
  const rowStyle = useAnimatedStyle(
    () => ({
      opacity: isSelectedWeek ? 1 : 1 - progress.value,
    }),
    [isSelectedWeek, progress]
  );

  return (
    <Animated.View style={rowStyle}>
      <WeekRow date={week}>{children}</WeekRow>
    </Animated.View>
  );
};
