import { addMonths, isSameMonth, subMonths } from "date-fns";
import type { ComponentRef, Dispatch, FC, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import PagerView from "react-native-pager-view";
import { withUniwind } from "uniwind";
import { CalendarBody } from "./calendar-body";
import { CALENDAR_PAGER_HEIGHT } from "./constants";

const PREVIOUS_MONTH_PAGE = 0;
const CURRENT_MONTH_PAGE = 1;
const NEXT_MONTH_PAGE = 2;
const MONTH_PAGES = [
  { key: "previous", offset: -1 },
  { key: "current", offset: 0 },
  { key: "next", offset: 1 },
] as const;

const StyledPagerView = withUniwind(PagerView);

type MonthPagerProps = {
  onTargetDateHandled?: () => void;
  selectedDate?: Date;
  setSelectedDate: (date: Date) => void;
  setYearMonth: Dispatch<SetStateAction<Date>>;
  targetDate?: Date;
  yearMonth: Date;
};

export const MonthPager: FC<MonthPagerProps> = ({
  onTargetDateHandled,
  selectedDate,
  setSelectedDate,
  setYearMonth,
  targetDate,
  yearMonth,
}) => {
  const pagerRef = useRef<ComponentRef<typeof PagerView>>(null);
  const selectedPageRef = useRef(CURRENT_MONTH_PAGE);
  const visibleMonths = useMemo(
    () =>
      MONTH_PAGES.map(({ key, offset }) => ({
        key,
        yearMonth: addMonths(yearMonth, offset),
      })),
    [yearMonth]
  );

  const resetToCurrentMonthPage = useCallback(() => {
    pagerRef.current?.setPageWithoutAnimation(CURRENT_MONTH_PAGE);
  }, []);

  useEffect(() => {
    if (!targetDate) {
      return;
    }

    if (isSameMonth(targetDate, yearMonth)) {
      setSelectedDate(targetDate);
      onTargetDateHandled?.();
      return;
    }

    selectedPageRef.current = CURRENT_MONTH_PAGE;
    resetToCurrentMonthPage();
    setYearMonth(targetDate);
    setSelectedDate(targetDate);
    onTargetDateHandled?.();
  }, [
    onTargetDateHandled,
    resetToCurrentMonthPage,
    setSelectedDate,
    setYearMonth,
    targetDate,
    yearMonth,
  ]);

  return (
    <StyledPagerView
      className="w-full"
      initialPage={CURRENT_MONTH_PAGE}
      onPageScrollStateChanged={(event) => {
        if (event.nativeEvent.pageScrollState !== "idle") {
          return;
        }

        const selectedPage = selectedPageRef.current;
        selectedPageRef.current = CURRENT_MONTH_PAGE;

        if (selectedPage === PREVIOUS_MONTH_PAGE) {
          resetToCurrentMonthPage();
          setYearMonth((currentYearMonth) => subMonths(currentYearMonth, 1));
          return;
        }

        if (selectedPage === NEXT_MONTH_PAGE) {
          resetToCurrentMonthPage();
          setYearMonth((currentYearMonth) => addMonths(currentYearMonth, 1));
        }
      }}
      onPageSelected={(event) => {
        selectedPageRef.current = event.nativeEvent.position;
      }}
      ref={pagerRef}
      style={{ height: CALENDAR_PAGER_HEIGHT }}
    >
      {visibleMonths.map((visibleMonth) => (
        <View className="w-full" key={visibleMonth.key}>
          <CalendarBody
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            yearMonth={visibleMonth.yearMonth}
          />
        </View>
      ))}
    </StyledPagerView>
  );
};
