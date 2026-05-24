import {
  getDate,
  isSameMonth,
  isSameWeek,
  isToday,
  startOfDay,
} from "date-fns";
import { selectionAsync } from "expo-haptics";
import { Text, useThemeColor } from "heroui-native";
import type { FC, ReactNode } from "react";
import { memo, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import type { CalendarHighlightTarget, WeekStartsOn } from "@/lib/app-settings";
import { getCalendarDateHighlightColor, getWeeksOfMonth } from "@/lib/date";
import type { Pattern } from "@/lib/instant";
import { cn } from "@/lib/utils";
import { CALENDAR_DAY_CELL_HEIGHT } from "./constants";
import { WeekRow } from "./week-row";

export type CalendarShiftSummary = {
  hasNotes: boolean;
  pattern?: Pattern;
};

export type ExportCalendarColorScheme = "dark" | "light";

type CalendarDateHighlightColor = ReturnType<
  typeof getCalendarDateHighlightColor
>;

const getDayKey = (date: Date): number => startOfDay(date).getTime();

type CalendarThemeColors = {
  background: string;
  foreground: string;
  surfaceSecondary: string;
};

type CalendarBodyProps = {
  calendarHighlightTargets: CalendarHighlightTarget[];
  detailTransitionProgress?: SharedValue<number>;
  patternsById: ReadonlyMap<string, Pattern>;
  onPressSelectedDate?: () => void;
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
  onPressSelectedDate,
  weekDate,
}) => {
  const fallbackProgress = useSharedValue(0);
  const transitionProgress = detailTransitionProgress ?? fallbackProgress;
  const weeks = useMemo(
    () => getWeeksOfMonth(yearMonth, { weekStartsOn }),
    [weekStartsOn, yearMonth]
  );
  const [backgroundColor, foregroundColor, surfaceSecondaryColor] =
    useThemeColor(["background", "foreground", "surface-secondary"]);
  const themeColors = useMemo<CalendarThemeColors>(
    () => ({
      background: backgroundColor,
      foreground: foregroundColor,
      surfaceSecondary: surfaceSecondaryColor,
    }),
    [backgroundColor, foregroundColor, surfaceSecondaryColor]
  );
  const selectedDateKey = getDayKey(selectedDate);
  const yearMonthKey = getDayKey(yearMonth);
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
    const dateKey = getDayKey(date);
    const shift = shiftsByDate.get(dateKey);
    const shiftPattern = shift?.pattern
      ? (patternsById.get(shift.pattern.id) ?? shift.pattern)
      : undefined;

    return (
      <CalendarDateCell
        calendarHighlightTargets={calendarHighlightTargets}
        date={date}
        dateKey={dateKey}
        exportColorScheme={exportColorScheme}
        hideOutOfMonthDates={hideOutOfMonthDates}
        isExportMode={isExportMode}
        onPressSelectedDate={onPressSelectedDate}
        selectedDateKey={selectedDateKey}
        setSelectedDate={setSelectedDate}
        shift={shift}
        shiftPattern={shiftPattern}
        shouldDimOutOfMonth={shouldDimOutOfMonth}
        themeColors={themeColors}
        yearMonthKey={yearMonthKey}
      />
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

type CalendarDateCellProps = {
  calendarHighlightTargets: CalendarHighlightTarget[];
  date: Date;
  dateKey: number;
  exportColorScheme: ExportCalendarColorScheme;
  hideOutOfMonthDates: boolean;
  isExportMode: boolean;
  onPressSelectedDate?: () => void;
  selectedDateKey: number;
  setSelectedDate: (date: Date) => void;
  shift?: CalendarShiftSummary;
  shiftPattern?: Pattern;
  shouldDimOutOfMonth: boolean;
  themeColors: CalendarThemeColors;
  yearMonthKey: number;
};

const CalendarDateCell: FC<CalendarDateCellProps> = memo(
  ({
    calendarHighlightTargets,
    date,
    dateKey,
    exportColorScheme,
    hideOutOfMonthDates,
    isExportMode,
    onPressSelectedDate,
    selectedDateKey,
    setSelectedDate,
    shift,
    shiftPattern,
    shouldDimOutOfMonth,
    themeColors,
    yearMonthKey,
  }) => {
    const yearMonth = new Date(yearMonthKey);
    const isOutOfMonth = shouldDimOutOfMonth && !isSameMonth(date, yearMonth);
    const shouldHideDateContent = hideOutOfMonthDates && isOutOfMonth;
    const isSelectedDate = !isExportMode && dateKey === selectedDateKey;
    const highlightColor = getCalendarDateHighlightColor(
      date,
      calendarHighlightTargets
    );
    const isDarkExport = isExportMode && exportColorScheme === "dark";
    const todayStyle = getTodayStyle(isToday(date), isExportMode, themeColors);
    const handlePress = () => {
      if (isSelectedDate) {
        onPressSelectedDate?.();
        return;
      }

      setSelectedDate(date);

      selectionAsync().catch(() => {
        // Haptics can be unavailable depending on the device or platform.
      });
    };

    return (
      <Pressable
        disabled={isExportMode || shouldHideDateContent}
        onPress={handlePress}
        style={[
          styles.dateCell,
          { height: CALENDAR_DAY_CELL_HEIGHT },
          todayStyle,
          isOutOfMonth && !shouldHideDateContent
            ? styles.outOfMonthDateCell
            : undefined,
          isSelectedDate && !shouldHideDateContent
            ? { backgroundColor: themeColors.foreground }
            : undefined,
        ]}
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
            themeColors={themeColors}
          />
        )}
      </Pressable>
    );
  },
  (previous, next) =>
    previous.calendarHighlightTargets === next.calendarHighlightTargets &&
    previous.dateKey === next.dateKey &&
    previous.exportColorScheme === next.exportColorScheme &&
    previous.hideOutOfMonthDates === next.hideOutOfMonthDates &&
    previous.isExportMode === next.isExportMode &&
    previous.onPressSelectedDate === next.onPressSelectedDate &&
    previous.selectedDateKey === next.selectedDateKey &&
    previous.setSelectedDate === next.setSelectedDate &&
    previous.shift?.hasNotes === next.shift?.hasNotes &&
    previous.shiftPattern?.countsAsDayOff ===
      next.shiftPattern?.countsAsDayOff &&
    previous.shiftPattern?.emoji === next.shiftPattern?.emoji &&
    previous.shiftPattern?.id === next.shiftPattern?.id &&
    previous.shiftPattern?.name === next.shiftPattern?.name &&
    previous.shouldDimOutOfMonth === next.shouldDimOutOfMonth &&
    previous.themeColors === next.themeColors &&
    previous.yearMonthKey === next.yearMonthKey
);

type CalendarDateCellContentProps = {
  date: Date;
  highlightColor: CalendarDateHighlightColor;
  isDarkExport: boolean;
  isExportMode: boolean;
  isSelectedDate: boolean;
  shift?: CalendarShiftSummary;
  shiftPattern?: Pattern;
  themeColors: CalendarThemeColors;
};

const CalendarDateCellContent: FC<CalendarDateCellContentProps> = ({
  date,
  highlightColor,
  isDarkExport,
  isExportMode,
  isSelectedDate,
  shift,
  shiftPattern,
  themeColors,
}) => {
  const isDayOffShift = Boolean(shiftPattern?.countsAsDayOff);

  return (
    <>
      {isExportMode && isDayOffShift ? (
        <View style={[styles.dateMarker, styles.dayOffMarker]} />
      ) : null}
      {shift?.hasNotes && !isExportMode ? (
        <View
          style={[
            styles.dateMarker,
            {
              backgroundColor: isSelectedDate
                ? themeColors.background
                : themeColors.foreground,
            },
          ]}
        />
      ) : null}
      <View style={styles.dateLabelBox}>
        <Text
          style={getDateTextStyle({
            highlightColor,
            isDarkExport,
            isExportMode,
            isSelectedDate,
            themeColors,
          })}
        >
          {getDate(date)}
        </Text>
      </View>
      {shiftPattern ? (
        <View style={styles.shiftSummary}>
          <Text numberOfLines={1} style={styles.shiftEmoji}>
            {shiftPattern.emoji}
          </Text>
          {isExportMode ? (
            <Text
              numberOfLines={1}
              style={getShiftNameStyle(isDarkExport, isExportMode, themeColors)}
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

const getTodayStyle = (
  isCurrentDateToday: boolean,
  isExportMode: boolean,
  themeColors: CalendarThemeColors
) => {
  if (!isCurrentDateToday) {
    return;
  }

  if (!isExportMode) {
    return { backgroundColor: themeColors.surfaceSecondary };
  }

  return;
};

const getDateTextStyle = ({
  highlightColor,
  isDarkExport,
  isExportMode,
  isSelectedDate,
  themeColors,
}: {
  highlightColor: CalendarDateHighlightColor;
  isDarkExport: boolean;
  isExportMode: boolean;
  isSelectedDate: boolean;
  themeColors: CalendarThemeColors;
}) => [
  styles.dateText,
  !isSelectedDate && highlightColor === "blue"
    ? styles.blueDateText
    : undefined,
  isSelectedDate ? { color: themeColors.background } : undefined,
  !isSelectedDate && highlightColor === "red" ? styles.redDateText : undefined,
  isDarkExport && highlightColor === undefined
    ? styles.darkExportDateText
    : undefined,
  isExportMode && !isDarkExport && highlightColor === undefined
    ? styles.lightExportDateText
    : undefined,
];

const getShiftNameStyle = (
  isDarkExport: boolean,
  isExportMode: boolean,
  themeColors: CalendarThemeColors
) => [
  styles.shiftName,
  isExportMode ? undefined : { color: themeColors.foreground },
  isDarkExport ? styles.darkExportShiftName : undefined,
  isExportMode && !isDarkExport ? styles.lightExportShiftName : undefined,
];

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

const styles = StyleSheet.create({
  blueDateText: {
    color: "#3b82f6",
  },
  darkExportDateText: {
    color: "#fafafa",
  },
  darkExportShiftName: {
    color: "#d4d4d8",
  },
  dateCell: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "column",
    padding: 4,
    position: "relative",
    width: "100%",
  },
  dateLabelBox: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 20,
    minWidth: 20,
  },
  dateMarker: {
    borderRadius: 3,
    height: 6,
    position: "absolute",
    right: 6,
    top: 6,
    width: 6,
  },
  dateText: {
    fontSize: 12,
    fontWeight: "600",
  },
  dayOffMarker: {
    backgroundColor: "#10b981",
  },
  lightExportDateText: {
    color: "#09090b",
  },
  lightExportShiftName: {
    color: "#52525b",
  },
  outOfMonthDateCell: {
    opacity: 0.4,
  },
  redDateText: {
    color: "#ef4444",
  },
  shiftEmoji: {
    fontSize: 14,
    textAlign: "center",
  },
  shiftName: {
    fontSize: 9,
    fontWeight: "500",
    lineHeight: 12,
    maxWidth: "100%",
    textAlign: "center",
  },
  shiftSummary: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    justifyContent: "center",
    minWidth: 0,
  },
});
