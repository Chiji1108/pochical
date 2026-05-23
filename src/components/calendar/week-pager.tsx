import type { FlashListRef, ListRenderItemInfo } from "@shopify/flash-list";
import { FlashList } from "@shopify/flash-list";
import {
  addDays,
  addWeeks,
  getDay,
  isSameMonth,
  isSameWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
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
import type { CalendarHighlightTarget, WeekStartsOn } from "@/lib/app-settings";
import type { Pattern } from "@/lib/instant";
import { CalendarBody, type CalendarShiftSummary } from "./calendar-body";
import { CALENDAR_WEEK_PAGER_HEIGHT } from "./constants";

const WEEK_BUFFER_SIZE = 10;
const WEEK_APPEND_BATCH_SIZE = 8;
const WEEK_APPEND_THRESHOLD = 3;

type WeekPagerProps = {
  calendarHighlightTargets: CalendarHighlightTarget[];
  onTargetDateHandled?: () => void;
  patternsById: ReadonlyMap<string, Pattern>;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  setYearMonth: Dispatch<SetStateAction<Date>>;
  shiftsByDate: ReadonlyMap<number, CalendarShiftSummary>;
  targetDate?: Date;
  weekStartsOn: WeekStartsOn;
  yearMonth: Date;
};

type PendingScrollWeek = {
  animated: boolean;
  week: Date;
};

const getWeekKey = (date: Date): string => date.toISOString();

const getWeekdayOffset = (date: Date, weekStartsOn: WeekStartsOn): number =>
  (getDay(date) - weekStartsOn + 7) % 7;

const getWeeksAround = (
  centerDate: Date,
  bufferSize: number,
  weekStartsOn: WeekStartsOn
): Date[] => {
  const weekStart = startOfWeek(centerDate, { weekStartsOn });
  const weeks: Date[] = [];

  for (let offset = -bufferSize; offset <= bufferSize; offset += 1) {
    weeks.push(addWeeks(weekStart, offset));
  }

  return weeks;
};

const containsWeek = (
  weeks: Date[],
  targetWeek: Date,
  weekStartsOn: WeekStartsOn
): boolean =>
  weeks.some((week) => isSameWeek(week, targetWeek, { weekStartsOn }));

const findWeekIndex = (
  weeks: Date[],
  targetWeek: Date,
  weekStartsOn: WeekStartsOn
): number =>
  weeks.findIndex((week) => isSameWeek(week, targetWeek, { weekStartsOn }));

export const WeekPager: FC<WeekPagerProps> = ({
  calendarHighlightTargets,
  onTargetDateHandled,
  patternsById,
  selectedDate,
  setSelectedDate,
  setYearMonth,
  shiftsByDate,
  targetDate,
  weekStartsOn,
  yearMonth,
}) => {
  const { width: pageWidth } = useWindowDimensions();
  const listRef = useRef<FlashListRef<Date>>(null);
  const currentOffsetRef = useRef(WEEK_BUFFER_SIZE * pageWidth);
  const pendingPrependCountRef = useRef(0);
  const visibleWeekRef = useRef(startOfWeek(selectedDate, { weekStartsOn }));
  const selectedWeekdayRef = useRef(
    getWeekdayOffset(selectedDate, weekStartsOn)
  );
  const [pendingScrollWeek, setPendingScrollWeek] =
    useState<PendingScrollWeek>();
  const [weeks, setWeeks] = useState<Date[]>(() =>
    getWeeksAround(selectedDate, WEEK_BUFFER_SIZE, weekStartsOn)
  );

  const scrollToWeek = useCallback(
    (targetWeek: Date, animated: boolean) => {
      setPendingScrollWeek({
        animated,
        week: startOfWeek(targetWeek, { weekStartsOn }),
      });
    },
    [weekStartsOn]
  );

  const prependWeeks = useCallback(() => {
    setWeeks((currentWeeks) => {
      const firstWeek = currentWeeks.at(0);

      if (!firstWeek) {
        return currentWeeks;
      }

      const prependedWeeks = Array.from(
        { length: WEEK_APPEND_BATCH_SIZE },
        (_, index) => addWeeks(firstWeek, index - WEEK_APPEND_BATCH_SIZE)
      );
      pendingPrependCountRef.current += prependedWeeks.length;

      return [...prependedWeeks, ...currentWeeks];
    });
  }, []);

  const appendWeeks = useCallback(() => {
    setWeeks((currentWeeks) => {
      const lastWeek = currentWeeks.at(-1);

      if (!lastWeek) {
        return currentWeeks;
      }

      const appendedWeeks = Array.from(
        { length: WEEK_APPEND_BATCH_SIZE },
        (_, index) => addWeeks(lastWeek, index + 1)
      );

      return [...currentWeeks, ...appendedWeeks];
    });
  }, []);

  const appendWeeksIfNeeded = useCallback(
    (pageIndex: number) => {
      if (pageIndex <= WEEK_APPEND_THRESHOLD) {
        prependWeeks();
      }

      if (weeks.length - pageIndex <= WEEK_APPEND_THRESHOLD + 1) {
        appendWeeks();
      }
    },
    [appendWeeks, prependWeeks, weeks.length]
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
      const visibleWeek = weeks.at(pageIndex);

      if (!visibleWeek) {
        return;
      }

      currentOffsetRef.current = pageIndex * pageWidth;
      visibleWeekRef.current = visibleWeek;
      appendWeeksIfNeeded(pageIndex);

      if (!isSameWeek(visibleWeek, selectedDate, { weekStartsOn })) {
        const nextSelectedDate = addDays(
          visibleWeek,
          selectedWeekdayRef.current
        );
        setSelectedDate(nextSelectedDate);
        setYearMonth(startOfMonth(nextSelectedDate));
      }
    },
    [
      appendWeeksIfNeeded,
      pageWidth,
      selectedDate,
      setSelectedDate,
      setYearMonth,
      weekStartsOn,
      weeks,
    ]
  );

  useEffect(() => {
    const selectedWeek = startOfWeek(selectedDate, { weekStartsOn });

    selectedWeekdayRef.current = getWeekdayOffset(selectedDate, weekStartsOn);
    setYearMonth((currentYearMonth) =>
      isSameMonth(currentYearMonth, selectedDate)
        ? currentYearMonth
        : startOfMonth(selectedDate)
    );
    setWeeks((currentWeeks) => {
      if (containsWeek(currentWeeks, selectedWeek, weekStartsOn)) {
        return currentWeeks;
      }

      return getWeeksAround(selectedDate, WEEK_BUFFER_SIZE, weekStartsOn);
    });

    if (!isSameWeek(visibleWeekRef.current, selectedWeek, { weekStartsOn })) {
      scrollToWeek(selectedWeek, true);
    }
  }, [scrollToWeek, selectedDate, setYearMonth, weekStartsOn]);

  useEffect(() => {
    if (!targetDate) {
      return;
    }

    const targetWeek = startOfWeek(targetDate, { weekStartsOn });
    const isTargetWeekLoaded = containsWeek(weeks, targetWeek, weekStartsOn);

    setSelectedDate(targetDate);
    setYearMonth(startOfMonth(targetDate));
    setWeeks((currentWeeks) => {
      if (containsWeek(currentWeeks, targetWeek, weekStartsOn)) {
        return currentWeeks;
      }

      return getWeeksAround(targetDate, WEEK_BUFFER_SIZE, weekStartsOn);
    });
    scrollToWeek(targetWeek, isTargetWeekLoaded);
    onTargetDateHandled?.();
  }, [
    onTargetDateHandled,
    scrollToWeek,
    setSelectedDate,
    setYearMonth,
    targetDate,
    weekStartsOn,
    weeks,
  ]);

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
    if (!pendingScrollWeek || pageWidth === 0) {
      return;
    }

    const pageIndex = findWeekIndex(
      weeks,
      pendingScrollWeek.week,
      weekStartsOn
    );

    if (pageIndex < 0) {
      return;
    }

    setPendingScrollWeek(undefined);
    currentOffsetRef.current = pageIndex * pageWidth;
    visibleWeekRef.current = pendingScrollWeek.week;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        animated: pendingScrollWeek.animated,
        offset: currentOffsetRef.current,
      });
    });
  }, [pageWidth, pendingScrollWeek, weekStartsOn, weeks]);

  const renderWeek = useCallback(
    ({ item }: ListRenderItemInfo<Date>) => (
      <View style={{ width: pageWidth }}>
        <CalendarBody
          calendarHighlightTargets={calendarHighlightTargets}
          patternsById={patternsById}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          shiftsByDate={shiftsByDate}
          weekDate={item}
          weekStartsOn={weekStartsOn}
          yearMonth={yearMonth}
        />
      </View>
    ),
    [
      calendarHighlightTargets,
      pageWidth,
      patternsById,
      selectedDate,
      setSelectedDate,
      shiftsByDate,
      weekStartsOn,
      yearMonth,
    ]
  );

  return (
    <FlashList
      contentInsetAdjustmentBehavior="never"
      data={weeks}
      decelerationRate="fast"
      extraData={{ pageWidth, selectedDate, weekStartsOn, yearMonth }}
      horizontal
      initialScrollIndex={WEEK_BUFFER_SIZE}
      keyExtractor={getWeekKey}
      maintainVisibleContentPosition={{ disabled: true }}
      onMomentumScrollEnd={handleScrollSettled}
      onScroll={handleScroll}
      onScrollEndDrag={handleScrollSettled}
      pagingEnabled
      ref={listRef}
      renderItem={renderWeek}
      scrollEventThrottle={16}
      showsHorizontalScrollIndicator={false}
      style={{ height: CALENDAR_WEEK_PAGER_HEIGHT, width: "100%" }}
    />
  );
};
