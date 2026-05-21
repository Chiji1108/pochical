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
  patternId?: string;
};

export type ExportCalendarColorScheme = "dark" | "light";

type CalendarDateHighlightColor = ReturnType<
  typeof getCalendarDateHighlightColor
>;

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
  exportColorScheme?: ExportCalendarColorScheme;
  hideOutOfMonthDates?: boolean;
  isExportMode?: boolean;
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
  exportColorScheme = "light",
  hideOutOfMonthDates = false,
  isExportMode = false,
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
    const isOutOfMonth = shouldDimOutOfMonth && !isSameMonth(date, yearMonth);
    const shouldHideDateContent = hideOutOfMonthDates && isOutOfMonth;
    const isSelectedDate = !isExportMode && isSameDay(date, selectedDate);
    const highlightColor = getCalendarDateHighlightColor(
      date,
      calendarHighlightTargets
    );
    const shift = shiftsByDate.get(startOfDay(date).getTime());
    const shiftPattern = shift?.patternId
      ? patternsById.get(shift.patternId)
      : undefined;
    const isDarkExport = isExportMode && exportColorScheme === "dark";
    const todayClassName = getTodayClassName(isToday(date), isExportMode);
    return (
      <Pressable
        className={cn(
          "relative flex w-full flex-col items-center rounded-lg p-1",
          todayClassName,
          {
            "opacity-40": isOutOfMonth && !shouldHideDateContent,
            "bg-foreground/85": isSelectedDate && !shouldHideDateContent,
          }
        )}
        disabled={isExportMode || shouldHideDateContent}
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
        {shouldHideDateContent ? null : (
          <CalendarDateCellContent
            date={date}
            highlightColor={highlightColor}
            isDarkExport={isDarkExport}
            isExportMode={isExportMode}
            isSelectedDate={isSelectedDate}
            shift={shift}
            shiftPattern={shiftPattern}
          />
        )}
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

type CalendarDateCellContentProps = {
  date: Date;
  highlightColor: CalendarDateHighlightColor;
  isDarkExport: boolean;
  isExportMode: boolean;
  isSelectedDate: boolean;
  shift?: CalendarShiftSummary;
  shiftPattern?: Pattern;
};

const CalendarDateCellContent: FC<CalendarDateCellContentProps> = ({
  date,
  highlightColor,
  isDarkExport,
  isExportMode,
  isSelectedDate,
  shift,
  shiftPattern,
}) => {
  const isDayOffShift = Boolean(shiftPattern?.countsAsDayOff);

  return (
    <>
      {isExportMode && isDayOffShift ? (
        <View className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
      ) : null}
      {shift?.hasNotes && !isExportMode ? (
        <View
          className={cn("absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full", {
            "bg-background": isSelectedDate,
            "bg-foreground/70": !isSelectedDate,
          })}
        />
      ) : null}
      <View className="min-h-5 min-w-5 items-center justify-center">
        <Text
          className={getDateTextClassName({
            highlightColor,
            isDarkExport,
            isExportMode,
            isSelectedDate,
          })}
        >
          {getDate(date)}
        </Text>
      </View>
      {shiftPattern ? (
        <View className="min-w-0 flex-1 items-center justify-center gap-0.5">
          <Text className="text-center text-sm" numberOfLines={1}>
            {shiftPattern.emoji}
          </Text>
          {isExportMode ? (
            <Text
              className={getShiftNameClassName(isDarkExport, isExportMode)}
              numberOfLines={1}
            >
              {shiftPattern.name}
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );
};

type CalendarAnimatedWeekRowProps = {
  children: (date: Date) => ReactNode;
  isSelectedWeek: boolean;
  progress: SharedValue<number>;
  week: Date;
  weekStartsOn: WeekStartsOn;
};

const getTodayClassName = (
  isCurrentDateToday: boolean,
  isExportMode: boolean
) => {
  if (!isCurrentDateToday) {
    return;
  }

  if (!isExportMode) {
    return "bg-foreground/5";
  }

  return;
};

const getDateTextClassName = ({
  highlightColor,
  isDarkExport,
  isExportMode,
  isSelectedDate,
}: {
  highlightColor: CalendarDateHighlightColor;
  isDarkExport: boolean;
  isExportMode: boolean;
  isSelectedDate: boolean;
}) =>
  cn("font-semibold text-xs", {
    "text-blue-500": !isSelectedDate && highlightColor === "blue",
    "text-background": isSelectedDate,
    "text-red-500": !isSelectedDate && highlightColor === "red",
    "text-zinc-50": isDarkExport && highlightColor === undefined,
    "text-zinc-950":
      isExportMode && !isDarkExport && highlightColor === undefined,
  });

const getShiftNameClassName = (isDarkExport: boolean, isExportMode: boolean) =>
  cn("max-w-full text-center font-medium text-[9px] leading-3", {
    "text-foreground/75": !isExportMode,
    "text-zinc-300": isDarkExport,
    "text-zinc-600": isExportMode && !isDarkExport,
  });

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
