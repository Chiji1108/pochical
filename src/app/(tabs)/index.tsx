import {
  addDays,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { selectionAsync } from "expo-haptics";
import { useRouter } from "expo-router";
import { useAll, useSession } from "jazz-tools/react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  type GestureType,
} from "react-native-gesture-handler";
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
import { useAppSettings } from "@/lib/app-settings";
import { app, type DayNote, type Member, type Pattern } from "@/schema";

const DETAIL_PAGE_DRAG_DISTANCE = 180;
const DETAIL_PAGE_SETTLE_THRESHOLD = 0.45;
const DETAIL_PAGE_SWIPE_VELOCITY = 600;
const DETAIL_PAGE_TRANSITION_DURATION = 220;
const TAB_OVERLAP_PADDING = 36;

export default function Index() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings } = useAppSettings();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isDetailInputMode, setIsDetailInputMode] = useState(false);
  const [isShiftInputMode, setIsShiftInputMode] = useState(false);
  const [yearMonth, setYearMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [targetDate, setTargetDate] = useState<Date>();
  const session = useSession();
  const currentUserId = session?.user_id ?? "";
  const detailPageProgress = useSharedValue(0);
  const detailModeGestureRef = useRef<GestureType>(undefined);
  const detailGestureStartProgress = useSharedValue(0);
  const detailGestureActivationTranslationY = useSharedValue(0);
  const detailGestureActive = useSharedValue(0);
  const detailGestureIsDriving = useSharedValue(0);
  const detailScrollOffsetY = useSharedValue(0);
  const bottomContentPadding = insets.bottom + TAB_OVERLAP_PADDING;
  const patterns =
    useAll(
      currentUserId
        ? app.patterns.where({ $createdBy: currentUserId })
        : undefined
    ) ?? [];
  const shifts =
    useAll(
      currentUserId
        ? app.shifts.where({ $createdBy: currentUserId })
        : undefined
    ) ?? [];
  const dayNotes =
    useAll(
      currentUserId
        ? app.dayNotes.where({ $createdBy: currentUserId })
        : undefined
    ) ?? [];
  const members =
    useAll(
      currentUserId
        ? app.members.where({ $createdBy: currentUserId })
        : undefined
    ) ?? [];
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
  const dayNotesByDate = useMemo(() => {
    const nextDayNotesByDate = new Map<number, DayNote>();

    for (const dayNote of dayNotes) {
      nextDayNotesByDate.set(startOfDay(dayNote.date).getTime(), dayNote);
    }

    return nextDayNotesByDate;
  }, [dayNotes]);
  const shiftsByDate = useMemo(() => {
    const nextShiftsByDate = new Map<number, CalendarShiftSummary>();

    for (const dayNote of dayNotes) {
      nextShiftsByDate.set(startOfDay(dayNote.date).getTime(), {
        hasNotes: Boolean(dayNote.notes.trim()),
      });
    }

    for (const shift of shifts) {
      const dateKey = startOfDay(shift.startDate).getTime();
      const existingSummary = nextShiftsByDate.get(dateKey);

      nextShiftsByDate.set(dateKey, {
        hasNotes: existingSummary?.hasNotes ?? false,
        patternId: shift.patternId,
      });
    }

    return nextShiftsByDate;
  }, [dayNotes, shifts]);
  const selectedDateShifts = useMemo(
    () => shifts.filter((shift) => isSameDay(shift.startDate, selectedDate)),
    [selectedDate, shifts]
  );
  const [selectedDateShift] = selectedDateShifts;
  const selectedDateDayNote = dayNotesByDate.get(
    startOfDay(selectedDate).getTime()
  );
  const returnToToday = () => {
    setTargetDate(new Date());
  };

  const openExport = () => {
    router.push({
      pathname: "/export",
      params: {
        yearMonth: startOfMonth(yearMonth).toISOString(),
      },
    });
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
        .withRef(detailModeGestureRef)
        .activeOffsetY([-12, 12])
        .failOffsetX([-24, 24])
        .onBegin(() => {
          cancelAnimation(detailPageProgress);
          detailGestureActive.value = 0;
          detailGestureActivationTranslationY.value = 0;
          detailGestureIsDriving.value = 0;
        })
        .onUpdate((event) => {
          if (detailGestureIsDriving.value === 0) {
            // Let the detail page pan take over only when the detail scroll is already at the top.
            const isOpeningFromCalendar =
              event.translationY < 0 && detailPageProgress.value < 1;
            const isClosingFromScrollTop =
              event.translationY > 0 &&
              detailPageProgress.value > 0 &&
              detailScrollOffsetY.value <= 0;

            if (!(isOpeningFromCalendar || isClosingFromScrollTop)) {
              return;
            }

            detailGestureIsDriving.value = 1;
            detailGestureActivationTranslationY.value = event.translationY;
            detailGestureStartProgress.value = detailPageProgress.value;
            detailGestureActive.value = withTiming(1, {
              duration: 120,
            });
          }

          const gestureTranslationY =
            event.translationY - detailGestureActivationTranslationY.value;
          const nextProgress =
            detailGestureStartProgress.value -
            gestureTranslationY / DETAIL_PAGE_DRAG_DISTANCE;
          detailPageProgress.value = Math.min(1, Math.max(0, nextProgress));
        })
        .onEnd((event) => {
          if (detailGestureIsDriving.value === 0) {
            return;
          }

          const shouldOpen =
            event.velocityY < -DETAIL_PAGE_SWIPE_VELOCITY ||
            (event.velocityY <= DETAIL_PAGE_SWIPE_VELOCITY &&
              detailPageProgress.value >= DETAIL_PAGE_SETTLE_THRESHOLD);

          runOnJS(setDetailInputMode)(shouldOpen);
        })
        .onFinalize(() => {
          detailGestureActive.value = withTiming(0, {
            duration: 180,
          });
          detailGestureIsDriving.value = 0;
        }),
    [
      detailGestureActivationTranslationY,
      detailGestureActive,
      detailGestureIsDriving,
      detailGestureStartProgress,
      detailPageProgress,
      detailScrollOffsetY,
      setDetailInputMode,
    ]
  );

  return (
    <View className="flex-1 bg-background">
      <View
        className="absolute inset-x-0 top-0 z-10 bg-background"
        onLayout={handleHeaderLayout}
        style={{ paddingTop: insets.top }}
      >
        <CalendarHeader
          calendarHighlightTargets={settings.calendarHighlightTargets}
          className="pt-0"
          onOpenExport={openExport}
          onPressToday={returnToToday}
          onSelectDate={setTargetDate}
          selectedDate={selectedDate}
          weekStartsOn={settings.weekStartsOn}
          yearMonth={yearMonth}
        />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <GestureDetector gesture={detailModeGesture}>
          <View
            className="flex-1 bg-background"
            style={{
              paddingTop: headerHeight,
            }}
          >
            <CalendarPager
              calendarHighlightTargets={settings.calendarHighlightTargets}
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
              weekStartsOn={settings.weekStartsOn}
              yearMonth={yearMonth}
            />
            <PatternGridHeader
              detailGestureActive={detailGestureActive}
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
                  detailModeGestureRef={detailModeGestureRef}
                  detailScrollOffsetY={detailScrollOffsetY}
                  detailTransitionProgress={detailPageProgress}
                  isDetailInputMode={isDetailInputMode}
                  onSelectDate={selectDateImmediately}
                  onSelectNextDay={selectNextDay}
                  patterns={patterns}
                  selectedDate={selectedDate}
                  selectedDateDayNote={selectedDateDayNote}
                  selectedDateShift={selectedDateShift}
                  shifts={shifts}
                />
              ) : (
                <ShiftDetailView
                  bottomContentPadding={bottomContentPadding}
                  membersById={membersById}
                  patternsById={patternsById}
                  selectedDateDayNote={selectedDateDayNote}
                  selectedDateShift={selectedDateShift}
                />
              )}
            </View>
          </View>
        </GestureDetector>
      </KeyboardAvoidingView>
    </View>
  );
}
