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
import type { Pattern } from "@/schema";
import { CalendarBody } from "./calendar-body";
import { CALENDAR_WEEK_PAGER_HEIGHT } from "./constants";

const WEEK_BUFFER_SIZE = 10;
const WEEK_APPEND_BATCH_SIZE = 8;
const WEEK_APPEND_THRESHOLD = 3;

type WeekPagerProps = {
  onTargetDateHandled?: () => void;
  patternsById: ReadonlyMap<string, Pattern>;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  setYearMonth: Dispatch<SetStateAction<Date>>;
  shiftsByDate: ReadonlyMap<number, string>;
  targetDate?: Date;
  yearMonth: Date;
};

type PendingScrollWeek = {
  animated: boolean;
  week: Date;
};

const getWeekKey = (date: Date): string => startOfWeek(date).toISOString();

const getWeeksAround = (centerDate: Date, bufferSize: number): Date[] => {
  const weekStart = startOfWeek(centerDate);
  const weeks: Date[] = [];

  for (let offset = -bufferSize; offset <= bufferSize; offset += 1) {
    weeks.push(addWeeks(weekStart, offset));
  }

  return weeks;
};

const containsWeek = (weeks: Date[], targetWeek: Date): boolean =>
  weeks.some((week) => isSameWeek(week, targetWeek));

const findWeekIndex = (weeks: Date[], targetWeek: Date): number =>
  weeks.findIndex((week) => isSameWeek(week, targetWeek));

export const WeekPager: FC<WeekPagerProps> = ({
  onTargetDateHandled,
  patternsById,
  selectedDate,
  setSelectedDate,
  setYearMonth,
  shiftsByDate,
  targetDate,
  yearMonth,
}) => {
  const { width: pageWidth } = useWindowDimensions();
  const listRef = useRef<FlashListRef<Date>>(null);
  const currentOffsetRef = useRef(WEEK_BUFFER_SIZE * pageWidth);
  const pendingPrependCountRef = useRef(0);
  const visibleWeekRef = useRef(startOfWeek(selectedDate));
  const selectedWeekdayRef = useRef(getDay(selectedDate));
  const [pendingScrollWeek, setPendingScrollWeek] =
    useState<PendingScrollWeek>();
  const [weeks, setWeeks] = useState<Date[]>(() =>
    getWeeksAround(selectedDate, WEEK_BUFFER_SIZE)
  );

  const scrollToWeek = useCallback((targetWeek: Date, animated: boolean) => {
    setPendingScrollWeek({
      animated,
      week: startOfWeek(targetWeek),
    });
  }, []);

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

      if (!isSameWeek(visibleWeek, selectedDate)) {
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
      weeks,
    ]
  );

  useEffect(() => {
    const selectedWeek = startOfWeek(selectedDate);

    selectedWeekdayRef.current = getDay(selectedDate);
    setYearMonth((currentYearMonth) =>
      isSameMonth(currentYearMonth, selectedDate)
        ? currentYearMonth
        : startOfMonth(selectedDate)
    );
    setWeeks((currentWeeks) => {
      if (containsWeek(currentWeeks, selectedWeek)) {
        return currentWeeks;
      }

      return getWeeksAround(selectedDate, WEEK_BUFFER_SIZE);
    });

    if (!isSameWeek(visibleWeekRef.current, selectedWeek)) {
      scrollToWeek(selectedWeek, true);
    }
  }, [scrollToWeek, selectedDate, setYearMonth]);

  useEffect(() => {
    if (!targetDate) {
      return;
    }

    const targetWeek = startOfWeek(targetDate);
    const isTargetWeekLoaded = containsWeek(weeks, targetWeek);

    setSelectedDate(targetDate);
    setYearMonth(startOfMonth(targetDate));
    setWeeks((currentWeeks) => {
      if (containsWeek(currentWeeks, targetWeek)) {
        return currentWeeks;
      }

      return getWeeksAround(targetDate, WEEK_BUFFER_SIZE);
    });
    scrollToWeek(targetWeek, isTargetWeekLoaded);
    onTargetDateHandled?.();
  }, [
    onTargetDateHandled,
    scrollToWeek,
    setSelectedDate,
    setYearMonth,
    targetDate,
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

    const pageIndex = findWeekIndex(weeks, pendingScrollWeek.week);

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
  }, [pageWidth, pendingScrollWeek, weeks]);

  const renderWeek = useCallback(
    ({ item }: ListRenderItemInfo<Date>) => (
      <View style={{ width: pageWidth }}>
        <CalendarBody
          patternsById={patternsById}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          shiftsByDate={shiftsByDate}
          weekDate={item}
          yearMonth={yearMonth}
        />
      </View>
    ),
    [
      pageWidth,
      patternsById,
      selectedDate,
      setSelectedDate,
      shiftsByDate,
      yearMonth,
    ]
  );

  return (
    <FlashList
      contentInsetAdjustmentBehavior="never"
      data={weeks}
      decelerationRate="fast"
      extraData={{ pageWidth, selectedDate, yearMonth }}
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
