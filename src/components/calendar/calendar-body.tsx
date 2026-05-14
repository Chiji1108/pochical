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
import { useAll } from "jazz-tools/react-native";
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
import { app, type Pattern } from "@/schema";
import { CALENDAR_DAY_CELL_HEIGHT } from "./constants";
import { WeekRow } from "./week-row";

type CalendarBodyProps = {
  detailTransitionProgress?: SharedValue<number>;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  yearMonth: Date;
  className?: string;
  weekDate?: Date;
};

export const CalendarBody: FC<CalendarBodyProps> = ({
  detailTransitionProgress,
  yearMonth,
  selectedDate,
  setSelectedDate,
  className,
  weekDate,
}) => {
  const fallbackProgress = useSharedValue(0);
  const transitionProgress = detailTransitionProgress ?? fallbackProgress;
  const patterns = useAll(app.patterns) ?? [];
  const shifts = useAll(app.shifts) ?? [];
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

  const renderDateCell = (date: Date, shouldDimOutOfMonth: boolean) => {
    const isSelectedDate = isSameDay(date, selectedDate);
    const shiftPatternId = shiftsByDate.get(startOfDay(date).getTime());
    const shiftPattern = shiftPatternId
      ? patternsById.get(shiftPatternId)
      : undefined;

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
          </View>
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
