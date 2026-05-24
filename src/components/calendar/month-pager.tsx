import type { FlashListRef, ListRenderItemInfo } from "@shopify/flash-list";
import { FlashList } from "@shopify/flash-list";
import { addMonths, isSameMonth, startOfMonth } from "date-fns";
import type { Dispatch, FC, SetStateAction } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useWindowDimensions, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { CalendarHighlightTarget, WeekStartsOn } from "@/lib/app-settings";
import type { Pattern } from "@/lib/instant";
import { CalendarBody, type CalendarShiftSummary } from "./calendar-body";
import { CALENDAR_PAGER_HEIGHT } from "./constants";

const MONTH_BUFFER_SIZE = 3;
const MONTH_APPEND_BATCH_SIZE = 3;
const MONTH_APPEND_THRESHOLD = 1;

type MonthPagerProps = {
  calendarHighlightTargets: CalendarHighlightTarget[];
  detailTransitionProgress?: SharedValue<number>;
  onPressSelectedDate?: () => void;
  onTargetDateHandled?: () => void;
  patternsById: ReadonlyMap<string, Pattern>;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  setYearMonth: Dispatch<SetStateAction<Date>>;
  shiftsByDate: ReadonlyMap<number, CalendarShiftSummary>;
  isExportMode?: boolean;
  scrollEnabled?: boolean;
  syncDate?: Date;
  targetDate?: Date;
  weekStartsOn: WeekStartsOn;
  yearMonth: Date;
};

type PendingScrollMonth = {
  animated: boolean;
  month: Date;
};

const getMonthKey = (date: Date): string => startOfMonth(date).toISOString();

const getMonthsAround = (centerMonth: Date, bufferSize: number): Date[] => {
  const monthStart = startOfMonth(centerMonth);
  const months: Date[] = [];

  for (let offset = -bufferSize; offset <= bufferSize; offset += 1) {
    months.push(addMonths(monthStart, offset));
  }

  return months;
};

const containsMonth = (months: Date[], targetMonth: Date): boolean =>
  months.some((month) => isSameMonth(month, targetMonth));

const findMonthIndex = (months: Date[], targetMonth: Date): number =>
  months.findIndex((month) => isSameMonth(month, targetMonth));

export const MonthPager: FC<MonthPagerProps> = ({
  calendarHighlightTargets,
  detailTransitionProgress,
  onPressSelectedDate,
  onTargetDateHandled,
  patternsById,
  selectedDate,
  setSelectedDate,
  setYearMonth,
  shiftsByDate,
  isExportMode = false,
  scrollEnabled = true,
  syncDate,
  targetDate,
  weekStartsOn,
  yearMonth,
}) => {
  const { width: pageWidth } = useWindowDimensions();
  const listRef = useRef<FlashListRef<Date>>(null);
  const currentOffsetRef = useRef(MONTH_BUFFER_SIZE * pageWidth);
  const pendingPrependCountRef = useRef(0);
  const [pendingScrollMonth, setPendingScrollMonth] =
    useState<PendingScrollMonth>();
  const [yearMonths, setYearMonths] = useState<Date[]>(() =>
    getMonthsAround(yearMonth, MONTH_BUFFER_SIZE)
  );

  const scrollToMonth = useCallback((targetMonth: Date, animated: boolean) => {
    setPendingScrollMonth({
      animated,
      month: startOfMonth(targetMonth),
    });
  }, []);

  const prependMonths = useCallback(() => {
    setYearMonths((currentMonths) => {
      const firstMonth = currentMonths.at(0);

      if (!firstMonth) {
        return currentMonths;
      }

      const prependedMonths = Array.from(
        { length: MONTH_APPEND_BATCH_SIZE },
        (_, index) => addMonths(firstMonth, index - MONTH_APPEND_BATCH_SIZE)
      );
      pendingPrependCountRef.current += prependedMonths.length;

      return [...prependedMonths, ...currentMonths];
    });
  }, []);

  const appendMonths = useCallback(() => {
    setYearMonths((currentMonths) => {
      const lastMonth = currentMonths.at(-1);

      if (!lastMonth) {
        return currentMonths;
      }

      const appendedMonths = Array.from(
        { length: MONTH_APPEND_BATCH_SIZE },
        (_, index) => addMonths(lastMonth, index + 1)
      );

      return [...currentMonths, ...appendedMonths];
    });
  }, []);

  const appendMonthsIfNeeded = useCallback(
    (pageIndex: number) => {
      if (pageIndex <= MONTH_APPEND_THRESHOLD) {
        prependMonths();
      }

      if (yearMonths.length - pageIndex <= MONTH_APPEND_THRESHOLD + 1) {
        appendMonths();
      }
    },
    [appendMonths, prependMonths, yearMonths.length]
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      currentOffsetRef.current = event.nativeEvent.contentOffset.x;
    },
    []
  );

  const handleScrollSettled = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageWidth === 0) {
        return;
      }

      const pageIndex = Math.round(
        event.nativeEvent.contentOffset.x / pageWidth
      );
      const visibleMonth = yearMonths.at(pageIndex);

      if (!visibleMonth) {
        return;
      }

      currentOffsetRef.current = pageIndex * pageWidth;
      appendMonthsIfNeeded(pageIndex);

      if (!isSameMonth(visibleMonth, yearMonth)) {
        setYearMonth(visibleMonth);
      }
    },
    [appendMonthsIfNeeded, pageWidth, setYearMonth, yearMonth, yearMonths]
  );

  useEffect(() => {
    if (!targetDate) {
      return;
    }

    const targetMonth = startOfMonth(targetDate);
    const isTargetMonthLoaded = containsMonth(yearMonths, targetMonth);

    setSelectedDate(targetDate);
    setYearMonth(targetMonth);
    setYearMonths((currentMonths) => {
      if (containsMonth(currentMonths, targetMonth)) {
        return currentMonths;
      }

      return getMonthsAround(targetMonth, MONTH_BUFFER_SIZE);
    });
    scrollToMonth(targetMonth, isTargetMonthLoaded);
    onTargetDateHandled?.();
  }, [
    onTargetDateHandled,
    scrollToMonth,
    setSelectedDate,
    setYearMonth,
    targetDate,
    yearMonths,
  ]);

  useEffect(() => {
    if (!syncDate) {
      return;
    }

    const syncMonth = startOfMonth(syncDate);

    setYearMonths((currentMonths) => {
      if (containsMonth(currentMonths, syncMonth)) {
        return currentMonths;
      }

      return getMonthsAround(syncMonth, MONTH_BUFFER_SIZE);
    });
    scrollToMonth(syncMonth, false);
  }, [scrollToMonth, syncDate]);

  useLayoutEffect(() => {
    const pendingPrependCount = pendingPrependCountRef.current;

    if (pendingPrependCount === 0 || pageWidth === 0) {
      return;
    }

    pendingPrependCountRef.current = 0;
    currentOffsetRef.current += pendingPrependCount * pageWidth;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        animated: false,
        offset: currentOffsetRef.current,
      });
    });
  });

  useLayoutEffect(() => {
    if (!pendingScrollMonth || pageWidth === 0) {
      return;
    }

    const pageIndex = findMonthIndex(yearMonths, pendingScrollMonth.month);

    if (pageIndex < 0) {
      return;
    }

    setPendingScrollMonth(undefined);
    currentOffsetRef.current = pageIndex * pageWidth;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        animated: pendingScrollMonth.animated,
        offset: currentOffsetRef.current,
      });
    });
  }, [pageWidth, pendingScrollMonth, yearMonths]);

  const renderMonth = useCallback(
    ({ item }: ListRenderItemInfo<Date>) => (
      <View style={{ width: pageWidth }}>
        <CalendarBody
          calendarHighlightTargets={calendarHighlightTargets}
          detailTransitionProgress={detailTransitionProgress}
          isExportMode={isExportMode}
          onPressSelectedDate={onPressSelectedDate}
          patternsById={patternsById}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          shiftsByDate={shiftsByDate}
          weekStartsOn={weekStartsOn}
          yearMonth={item}
        />
      </View>
    ),
    [
      detailTransitionProgress,
      calendarHighlightTargets,
      isExportMode,
      onPressSelectedDate,
      pageWidth,
      patternsById,
      selectedDate,
      setSelectedDate,
      shiftsByDate,
      weekStartsOn,
    ]
  );

  return (
    <FlashList
      contentInsetAdjustmentBehavior="never"
      data={yearMonths}
      decelerationRate="fast"
      extraData={{ pageWidth, selectedDate, weekStartsOn }}
      horizontal
      initialScrollIndex={MONTH_BUFFER_SIZE}
      keyExtractor={getMonthKey}
      maintainVisibleContentPosition={{ disabled: true }}
      onMomentumScrollEnd={handleScrollSettled}
      onScroll={handleScroll}
      onScrollEndDrag={handleScrollSettled}
      pagingEnabled
      ref={listRef}
      renderItem={renderMonth}
      scrollEnabled={scrollEnabled}
      scrollEventThrottle={16}
      showsHorizontalScrollIndicator={false}
      style={{ height: CALENDAR_PAGER_HEIGHT, width: "100%" }}
    />
  );
};
