import {
  addDays,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { BlurTargetView, BlurView } from "expo-blur";
import { selectionAsync } from "expo-haptics";
import { useAll } from "jazz-tools/react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  cancelAnimation,
  runOnJS,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CalendarShiftSummary } from "@/components/calendar/calendar-body";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { CalendarPager } from "@/components/calendar/calendar-pager";
import { PatternGridHeader } from "@/components/pattern/pattern-grid-header";
import { PatternGridView } from "@/components/pattern/pattern-grid-view";
import { ShiftDetailView } from "@/components/shift/shift-detail-view";
import { app, type Member, type Pattern } from "@/schema";

const DETAIL_PAGE_DRAG_DISTANCE = 180;
const DETAIL_PAGE_SETTLE_THRESHOLD = 0.45;
const DETAIL_PAGE_SWIPE_VELOCITY = 600;
const DETAIL_PAGE_TRANSITION_DURATION = 220;
const TAB_OVERLAP_PADDING = 36;

export default function Index() {
  const insets = useSafeAreaInsets();
  const blurTargetRef = useRef<View | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isDetailInputMode, setIsDetailInputMode] = useState(false);
  const [isShiftInputMode, setIsShiftInputMode] = useState(false);
  const [yearMonth, setYearMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [targetDate, setTargetDate] = useState<Date>();
  const detailPageProgress = useSharedValue(0);
  const detailGestureStartProgress = useSharedValue(0);
  const bottomContentPadding = insets.bottom + TAB_OVERLAP_PADDING;
  const patterns = useAll(app.patterns) ?? [];
  const shifts = useAll(app.shifts) ?? [];
  const members = useAll(app.members) ?? [];
  const patternsById = useMemo(() => {
    const nextPatternsById = new Map<string, Pattern>();

    for (const pattern of patterns) {
      nextPatternsById.set(pattern.id, pattern);
    }

    return nextPatternsById;
  }, [patterns]);
  const membersById = useMemo(() => {
    const nextMembersById = new Map<string, Member>();

    for (const member of members) {
      nextMembersById.set(member.id, member);
    }

    return nextMembersById;
  }, [members]);
  const shiftsByDate = useMemo(() => {
    const nextShiftsByDate = new Map<number, CalendarShiftSummary>();

    for (const shift of shifts) {
      nextShiftsByDate.set(startOfDay(shift.startDate).getTime(), {
        hasNotes: Boolean(shift.notes?.trim()),
        patternId: shift.patternId,
      });
    }

    return nextShiftsByDate;
  }, [shifts]);
  const selectedDateShifts = useMemo(
    () => shifts.filter((shift) => isSameDay(shift.startDate, selectedDate)),
    [selectedDate, shifts]
  );
  const [selectedDateShift] = selectedDateShifts;

  const returnToToday = () => {
    setTargetDate(new Date());
  };

  const selectDateImmediately = (date: Date) => {
    setSelectedDate(date);

    if (!isSameMonth(date, yearMonth)) {
      setYearMonth(startOfMonth(date));
      setTargetDate(date);
    }
  };

  const selectNextDay = () => {
    selectDateImmediately(addDays(selectedDate, 1));
  };

  const setDetailInputMode = useCallback(
    (isEnabled: boolean) => {
      detailPageProgress.value = withTiming(isEnabled ? 1 : 0, {
        duration: DETAIL_PAGE_TRANSITION_DURATION,
      });

      if (isDetailInputMode !== isEnabled) {
        selectionAsync().catch(() => {
          // Haptics can be unavailable depending on the device or platform.
        });
      }

      setIsDetailInputMode(isEnabled);
    },
    [detailPageProgress, isDetailInputMode]
  );

  const toggleShiftInputMode = () => {
    if (isShiftInputMode) {
      setDetailInputMode(false);
    }

    setIsShiftInputMode((current) => !current);
  };

  const handleHeaderLayout = (event: LayoutChangeEvent) => {
    const nextHeaderHeight = Math.ceil(event.nativeEvent.layout.height);
    setHeaderHeight((currentHeaderHeight) =>
      currentHeaderHeight === nextHeaderHeight
        ? currentHeaderHeight
        : nextHeaderHeight
    );
  };

  const detailModeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .failOffsetX([-24, 24])
        .onBegin(() => {
          cancelAnimation(detailPageProgress);
          detailGestureStartProgress.value = detailPageProgress.value;
        })
        .onUpdate((event) => {
          if (!(isShiftInputMode || isDetailInputMode)) {
            return;
          }

          const nextProgress =
            detailGestureStartProgress.value -
            event.translationY / DETAIL_PAGE_DRAG_DISTANCE;
          detailPageProgress.value = Math.min(1, Math.max(0, nextProgress));
        })
        .onEnd((event) => {
          if (!(isShiftInputMode || isDetailInputMode)) {
            return;
          }

          const shouldOpen =
            event.velocityY < -DETAIL_PAGE_SWIPE_VELOCITY ||
            (event.velocityY <= DETAIL_PAGE_SWIPE_VELOCITY &&
              detailPageProgress.value >= DETAIL_PAGE_SETTLE_THRESHOLD);

          runOnJS(setDetailInputMode)(shouldOpen);
        }),
    [
      detailGestureStartProgress,
      detailPageProgress,
      isDetailInputMode,
      isShiftInputMode,
      setDetailInputMode,
    ]
  );

  return (
    <View className="flex-1 bg-background">
      <BlurView
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={blurTargetRef}
        className="absolute inset-x-0 top-0 z-10 bg-background/95"
        intensity={30}
        onLayout={handleHeaderLayout}
        style={{ paddingTop: insets.top }}
        tint="systemThinMaterial"
      >
        <CalendarHeader
          className="pt-0"
          onPressToday={returnToToday}
          onSelectDate={setTargetDate}
          selectedDate={selectedDate}
          yearMonth={yearMonth}
        />
      </BlurView>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <GestureDetector gesture={detailModeGesture}>
          <BlurTargetView
            className="flex-1 bg-background"
            ref={blurTargetRef}
            style={{
              paddingTop: headerHeight,
            }}
          >
            <CalendarPager
              detailTransitionProgress={detailPageProgress}
              isDetailInputMode={isDetailInputMode}
              onTargetDateHandled={() => {
                setTargetDate(undefined);
              }}
              patternsById={patternsById}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              setYearMonth={setYearMonth}
              shiftsByDate={shiftsByDate}
              targetDate={targetDate}
              yearMonth={yearMonth}
            />
            <PatternGridHeader
              detailTransitionProgress={detailPageProgress}
              isDetailInputMode={isDetailInputMode}
              isShiftInputMode={isShiftInputMode}
              onSelectDate={setTargetDate}
              onSelectNextDay={selectNextDay}
              onToggleShiftInputMode={toggleShiftInputMode}
              selectedDate={selectedDate}
              selectedDateShifts={selectedDateShifts}
            />
            <View className="flex-1">
              {isShiftInputMode ? (
                <PatternGridView
                  bottomContentPadding={bottomContentPadding}
                  detailTransitionProgress={detailPageProgress}
                  isDetailInputMode={isDetailInputMode}
                  onSelectDate={selectDateImmediately}
                  onSelectNextDay={selectNextDay}
                  patterns={patterns}
                  selectedDate={selectedDate}
                  selectedDateShift={selectedDateShift}
                  shifts={shifts}
                />
              ) : (
                <ShiftDetailView
                  bottomContentPadding={bottomContentPadding}
                  membersById={membersById}
                  patternsById={patternsById}
                  selectedDateShift={selectedDateShift}
                />
              )}
            </View>
          </BlurTargetView>
        </GestureDetector>
      </KeyboardAvoidingView>
    </View>
  );
}
