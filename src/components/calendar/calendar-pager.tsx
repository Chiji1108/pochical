import type { Dispatch, FC, SetStateAction } from "react";
import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { CalendarHighlightTarget, WeekStartsOn } from "@/lib/app-settings";
import type { Pattern } from "@/schema";
import type { CalendarShiftSummary } from "./calendar-body";
import { CALENDAR_PAGER_HEIGHT, CALENDAR_WEEK_PAGER_HEIGHT } from "./constants";
import { MonthPager } from "./month-pager";
import { WeekPager } from "./week-pager";

const DETAIL_TRANSITION_DURATION = 260;

type CalendarPagerProps = {
  calendarHighlightTargets: CalendarHighlightTarget[];
  detailTransitionProgress?: SharedValue<number>;
  isDetailInputMode: boolean;
  onTargetDateHandled?: () => void;
  patternsById: ReadonlyMap<string, Pattern>;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  setYearMonth: Dispatch<SetStateAction<Date>>;
  shiftsByDate: ReadonlyMap<number, CalendarShiftSummary>;
  isExportMode?: boolean;
  targetDate?: Date;
  weekStartsOn: WeekStartsOn;
  yearMonth: Date;
};

export const CalendarPager: FC<CalendarPagerProps> = ({
  calendarHighlightTargets,
  detailTransitionProgress,
  isDetailInputMode,
  onTargetDateHandled,
  patternsById,
  selectedDate,
  setSelectedDate,
  setYearMonth,
  shiftsByDate,
  isExportMode = false,
  targetDate,
  weekStartsOn,
  yearMonth,
}) => {
  const fallbackProgress = useSharedValue(isDetailInputMode ? 1 : 0);
  const transitionProgress = detailTransitionProgress ?? fallbackProgress;
  const containerStyle = useAnimatedStyle(() => {
    const nextHeight =
      CALENDAR_PAGER_HEIGHT -
      (CALENDAR_PAGER_HEIGHT - CALENDAR_WEEK_PAGER_HEIGHT) *
        transitionProgress.value;

    return {
      height: nextHeight,
    };
  });
  const monthLayerStyle = useAnimatedStyle(
    () => ({
      opacity: isExportMode ? 1 : 1 - transitionProgress.value,
    }),
    [isExportMode, transitionProgress]
  );
  const weekLayerStyle = useAnimatedStyle(
    () => ({
      opacity: isExportMode ? 0 : transitionProgress.value,
    }),
    [isExportMode, transitionProgress]
  );

  useEffect(() => {
    if (detailTransitionProgress) {
      return;
    }

    cancelAnimation(transitionProgress);
    transitionProgress.value = withTiming(isDetailInputMode ? 1 : 0, {
      duration: DETAIL_TRANSITION_DURATION,
    });
  }, [detailTransitionProgress, isDetailInputMode, transitionProgress]);

  return (
    <Animated.View style={[containerStyle, { overflow: "hidden" }]}>
      <Animated.View
        pointerEvents={isDetailInputMode && !isExportMode ? "none" : "auto"}
        style={monthLayerStyle}
      >
        <MonthPager
          calendarHighlightTargets={calendarHighlightTargets}
          detailTransitionProgress={transitionProgress}
          isExportMode={isExportMode}
          onTargetDateHandled={
            isDetailInputMode ? undefined : onTargetDateHandled
          }
          patternsById={patternsById}
          scrollEnabled={!isDetailInputMode}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          setYearMonth={setYearMonth}
          shiftsByDate={shiftsByDate}
          syncDate={isDetailInputMode ? selectedDate : undefined}
          targetDate={isDetailInputMode ? undefined : targetDate}
          weekStartsOn={weekStartsOn}
          yearMonth={yearMonth}
        />
      </Animated.View>
      <Animated.View
        pointerEvents={isDetailInputMode && !isExportMode ? "auto" : "none"}
        style={[
          {
            left: 0,
            position: "absolute",
            right: 0,
            top: 0,
          },
          weekLayerStyle,
        ]}
      >
        <WeekPager
          calendarHighlightTargets={calendarHighlightTargets}
          onTargetDateHandled={
            isDetailInputMode ? onTargetDateHandled : undefined
          }
          patternsById={patternsById}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          setYearMonth={setYearMonth}
          shiftsByDate={shiftsByDate}
          targetDate={isDetailInputMode ? targetDate : undefined}
          weekStartsOn={weekStartsOn}
          yearMonth={yearMonth}
        />
      </Animated.View>
    </Animated.View>
  );
};
