import {
  getDate,
  isSameMonth,
  isSameWeek,
  isToday,
  startOfDay,
} from "date-fns";
import { selectionAsync } from "expo-haptics";
import { Typography, useThemeColor } from "heroui-native";
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
import { cn } from "@/lib/utils";
import type { Pattern } from "@/lib/work-data";
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
  emojiOnly?: boolean;
  hideOutOfMonthDates?: boolean;
  isExportMode?: boolean;
  highlightDayOffShifts?: boolean;
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
  emojiOnly = false,
  hideOutOfMonthDates = false,
  isExportMode = false,
  onPressSelectedDate,
  highlightDayOffShifts = true,
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
  const monthContentStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          -selectedWeekIndex *
          CALENDAR_DAY_CELL_HEIGHT *
          transitionProgress.value,
      },
    ],
  }));

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
        emojiOnly={emojiOnly}
        exportColorScheme={exportColorScheme}
        hideOutOfMonthDates={hideOutOfMonthDates}
        highlightDayOffShifts={highlightDayOffShifts}
        isExportMode={isExportMode}
        isSelectedDate={!isExportMode && dateKey === selectedDateKey}
        onPressSelectedDate={onPressSelectedDate}
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
  emojiOnly: boolean;
  hideOutOfMonthDates: boolean;
  isExportMode: boolean;
  onPressSelectedDate?: () => void;
  isSelectedDate: boolean;
  setSelectedDate: (date: Date) => void;
  shift?: CalendarShiftSummary;
  shiftPattern?: Pattern;
  shouldDimOutOfMonth: boolean;
  highlightDayOffShifts: boolean;
  themeColors: CalendarThemeColors;
  yearMonthKey: number;
};

const CalendarDateCell: FC<CalendarDateCellProps> = memo(
  ({
    calendarHighlightTargets,
    date,
    exportColorScheme,
    emojiOnly,
    hideOutOfMonthDates,
    isExportMode,
    onPressSelectedDate,
    isSelectedDate,
    setSelectedDate,
    shift,
    shiftPattern,
    shouldDimOutOfMonth,
    highlightDayOffShifts,
    themeColors,
    yearMonthKey,
  }) => {
    const yearMonth = new Date(yearMonthKey);
    const isOutOfMonth = shouldDimOutOfMonth && !isSameMonth(date, yearMonth);
    const shouldHideDateContent = hideOutOfMonthDates && isOutOfMonth;
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
            emojiOnly={emojiOnly}
            highlightColor={highlightColor}
            highlightDayOffShifts={highlightDayOffShifts}
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
    previous.emojiOnly === next.emojiOnly &&
    previous.hideOutOfMonthDates === next.hideOutOfMonthDates &&
    previous.isExportMode === next.isExportMode &&
    previous.onPressSelectedDate === next.onPressSelectedDate &&
    previous.isSelectedDate === next.isSelectedDate &&
    previous.setSelectedDate === next.setSelectedDate &&
    previous.shift?.hasNotes === next.shift?.hasNotes &&
    previous.shiftPattern?.countsAsDayOff ===
      next.shiftPattern?.countsAsDayOff &&
    previous.shiftPattern?.emoji === next.shiftPattern?.emoji &&
    previous.shiftPattern?.id === next.shiftPattern?.id &&
    previous.shiftPattern?.name === next.shiftPattern?.name &&
    previous.shouldDimOutOfMonth === next.shouldDimOutOfMonth &&
    previous.highlightDayOffShifts === next.highlightDayOffShifts &&
    previous.themeColors === next.themeColors &&
    previous.yearMonthKey === next.yearMonthKey
);

type CalendarDateCellContentProps = {
  date: Date;
  emojiOnly: boolean;
  highlightColor: CalendarDateHighlightColor;
  isDarkExport: boolean;
  isExportMode: boolean;
  isSelectedDate: boolean;
  shift?: CalendarShiftSummary;
  shiftPattern?: Pattern;
  highlightDayOffShifts: boolean;
  themeColors: CalendarThemeColors;
};

const CalendarDateCellContent: FC<CalendarDateCellContentProps> = ({
  date,
  emojiOnly,
  highlightColor,
  isDarkExport,
  isExportMode,
  isSelectedDate,
  shift,
  shiftPattern,
  highlightDayOffShifts,
  themeColors,
}) => {
  const isHighlightedDayOff =
    isExportMode &&
    highlightDayOffShifts &&
    Boolean(shiftPattern?.countsAsDayOff);
  const showShiftName = isExportMode && !emojiOnly;
  const dayOffDateTextStyle = isDarkExport
    ? styles.lightExportDateText
    : styles.darkExportDateText;

  return (
    <>
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
        {isHighlightedDayOff ? (
          <View
            style={[
              styles.dayOffDateChip,
              isDarkExport ? styles.darkDayOffDateChip : undefined,
            ]}
          />
        ) : null}
        <Typography
          style={[
            getDateTextStyle({
              highlightColor,
              isDarkExport,
              isExportMode,
              isSelectedDate,
              themeColors,
            }),
            isHighlightedDayOff ? dayOffDateTextStyle : undefined,
          ]}
        >
          {getDate(date)}
        </Typography>
      </View>
      {shiftPattern ? (
        <View style={styles.shiftSummary}>
          <Typography numberOfLines={1} style={styles.shiftEmoji}>
            {shiftPattern.emoji}
          </Typography>
          {showShiftName ? (
            <Typography
              numberOfLines={1}
              style={getShiftNameStyle(isDarkExport, isExportMode, themeColors)}
            >
              {shiftPattern.name}
            </Typography>
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
  isExportMode ? styles.exportDateText : undefined,
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
  const rowStyle = useAnimatedStyle(() => ({
    opacity: isSelectedWeek ? 1 : 1 - progress.value,
  }));

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
    color: "#e4e4e7",
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
  dayOffDateChip: {
    backgroundColor: "#3f3f46",
    borderRadius: 999,
    height: 16,
    position: "absolute",
    width: 32,
  },
  darkDayOffDateChip: {
    backgroundColor: "#e4e4e7",
  },
  exportDateText: {
    includeFontPadding: false,
    lineHeight: 14,
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
    includeFontPadding: false,
    lineHeight: 12,
    marginTop: -2,
    maxWidth: "100%",
    textAlign: "center",
  },
  shiftSummary: {
    alignItems: "center",
    flex: 1,
    gap: 0,
    justifyContent: "center",
    minWidth: 0,
  },
});
