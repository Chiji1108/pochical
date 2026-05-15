import type { Dispatch, FC, SetStateAction } from "react";
import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { Pattern } from "@/schema";
import { CALENDAR_PAGER_HEIGHT, CALENDAR_WEEK_PAGER_HEIGHT } from "./constants";
import { MonthPager } from "./month-pager";
import { WeekPager } from "./week-pager";

const DETAIL_TRANSITION_DURATION = 260;

type CalendarPagerProps = {
  detailTransitionProgress?: SharedValue<number>;
  isDetailInputMode: boolean;
  onTargetDateHandled?: () => void;
  patternsById: ReadonlyMap<string, Pattern>;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  setYearMonth: Dispatch<SetStateAction<Date>>;
  shiftsByDate: ReadonlyMap<number, string>;
  targetDate?: Date;
  yearMonth: Date;
};

export const CalendarPager: FC<CalendarPagerProps> = ({
  detailTransitionProgress,
  isDetailInputMode,
  onTargetDateHandled,
  patternsById,
  selectedDate,
  setSelectedDate,
  setYearMonth,
  shiftsByDate,
  targetDate,
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
  const monthLayerStyle = useAnimatedStyle(() => ({
    opacity: 1 - transitionProgress.value,
  }));
  const weekLayerStyle = useAnimatedStyle(() => ({
    opacity: transitionProgress.value,
  }));

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
        pointerEvents={isDetailInputMode ? "none" : "auto"}
        style={monthLayerStyle}
      >
        <MonthPager
          detailTransitionProgress={transitionProgress}
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
          yearMonth={yearMonth}
        />
      </Animated.View>
      <Animated.View
        pointerEvents={isDetailInputMode ? "auto" : "none"}
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
          onTargetDateHandled={
            isDetailInputMode ? onTargetDateHandled : undefined
          }
          patternsById={patternsById}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          setYearMonth={setYearMonth}
          shiftsByDate={shiftsByDate}
          targetDate={isDetailInputMode ? targetDate : undefined}
          yearMonth={yearMonth}
        />
      </Animated.View>
    </Animated.View>
  );
};
