import {
  addDays,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
} from "date-fns";
import {
  CalendarAccessLevel,
  createEventAsync,
  EntityTypes,
  getCalendarsAsync,
  getDefaultCalendarAsync,
  requestCalendarPermissionsAsync,
} from "expo-calendar";
import { selectionAsync } from "expo-haptics";
import { useAll, useSession } from "jazz-tools/react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
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
import { getMonthlyShiftCalendarEvents } from "@/lib/calendar-export";
import { app, type Member, type Pattern, type ShiftNote } from "@/schema";

const DETAIL_PAGE_DRAG_DISTANCE = 180;
const DETAIL_PAGE_SETTLE_THRESHOLD = 0.45;
const DETAIL_PAGE_SWIPE_VELOCITY = 600;
const DETAIL_PAGE_TRANSITION_DURATION = 220;
const TAB_OVERLAP_PADDING = 36;
const READ_ONLY_CALENDAR_ACCESS_LEVELS = new Set<CalendarAccessLevel>([
  CalendarAccessLevel.FREEBUSY,
  CalendarAccessLevel.NONE,
  CalendarAccessLevel.READ,
]);

const getWritableCalendarId = async (): Promise<string | undefined> => {
  const permission = await requestCalendarPermissionsAsync();

  if (!permission.granted) {
    return;
  }

  try {
    const defaultCalendar = await getDefaultCalendarAsync();

    if (defaultCalendar.allowsModifications) {
      return defaultCalendar.id;
    }
  } catch {
    // Android does not always expose a default calendar through this API.
  }

  const calendars = await getCalendarsAsync(EntityTypes.EVENT);
  const writableCalendars = calendars.filter(
    (calendar) =>
      calendar.allowsModifications &&
      !(
        calendar.accessLevel &&
        READ_ONLY_CALENDAR_ACCESS_LEVELS.has(calendar.accessLevel)
      )
  );
  const primaryCalendar = writableCalendars.find(
    (calendar) => calendar.isPrimary
  );

  return primaryCalendar?.id ?? writableCalendars[0]?.id;
};

export default function Index() {
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isExportingMonth, setIsExportingMonth] = useState(false);
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
  const shiftNotes =
    useAll(
      currentUserId
        ? app.shiftNotes.where({ $createdBy: currentUserId })
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
  const shiftNotesByShiftId = useMemo(() => {
    const nextShiftNotesByShiftId = new Map<string, ShiftNote>();

    for (const shiftNote of shiftNotes) {
      nextShiftNotesByShiftId.set(shiftNote.shiftId, shiftNote);
    }

    return nextShiftNotesByShiftId;
  }, [shiftNotes]);
  const shiftsByDate = useMemo(() => {
    const nextShiftsByDate = new Map<number, CalendarShiftSummary>();

    for (const shift of shifts) {
      nextShiftsByDate.set(startOfDay(shift.startDate).getTime(), {
        hasNotes: Boolean(shiftNotesByShiftId.get(shift.id)?.notes.trim()),
        patternId: shift.patternId,
      });
    }

    return nextShiftsByDate;
  }, [shiftNotesByShiftId, shifts]);
  const selectedDateShifts = useMemo(
    () => shifts.filter((shift) => isSameDay(shift.startDate, selectedDate)),
    [selectedDate, shifts]
  );
  const [selectedDateShift] = selectedDateShifts;
  const selectedDateShiftNote = selectedDateShift
    ? shiftNotesByShiftId.get(selectedDateShift.id)
    : undefined;
  const monthlyShiftCalendarEvents = useMemo(
    () =>
      getMonthlyShiftCalendarEvents({
        membersById,
        patternsById,
        shiftNotesByShiftId,
        shifts,
        yearMonth,
      }),
    [membersById, patternsById, shiftNotesByShiftId, shifts, yearMonth]
  );

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

  const exportMonthlyShifts = async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "カレンダーに書き出せません",
        "端末のカレンダーアプリへの書き出しは iOS / Android で利用できます。"
      );
      return;
    }

    if (monthlyShiftCalendarEvents.length === 0) {
      Alert.alert("書き出すシフトがありません");
      return;
    }

    setIsExportingMonth(true);

    try {
      const calendarId = await getWritableCalendarId();

      if (!calendarId) {
        Alert.alert(
          "カレンダー権限が必要です",
          "端末のカレンダーへのアクセスを許可してから、もう一度お試しください。"
        );
        return;
      }

      for (const event of monthlyShiftCalendarEvents) {
        await createEventAsync(calendarId, event);
      }

      Alert.alert(
        "書き出しました",
        `${format(yearMonth, "yyyy年M月")}のシフト ${monthlyShiftCalendarEvents.length}件を端末カレンダーに追加しました。`
      );
    } catch {
      Alert.alert(
        "書き出しに失敗しました",
        "端末カレンダーに予定を追加できませんでした。カレンダー設定を確認してから、もう一度お試しください。"
      );
    } finally {
      setIsExportingMonth(false);
    }
  };

  const confirmExportMonthlyShifts = () => {
    Alert.alert(
      "シフトを書き出しますか？",
      `${format(yearMonth, "yyyy年M月")}のシフト ${monthlyShiftCalendarEvents.length}件を端末カレンダーに追加します。既に書き出した予定は重複する場合があります。`,
      [
        { style: "cancel", text: "キャンセル" },
        {
          onPress: () => {
            exportMonthlyShifts().catch(() => {
              Alert.alert("書き出しに失敗しました");
            });
          },
          text: "書き出す",
        },
      ]
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
          className="pt-0"
          isExportingMonth={isExportingMonth}
          monthlyShiftCount={monthlyShiftCalendarEvents.length}
          onExportMonth={confirmExportMonthlyShifts}
          onPressToday={returnToToday}
          onSelectDate={setTargetDate}
          selectedDate={selectedDate}
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
              detailGestureActive={detailGestureActive}
              detailTransitionProgress={detailPageProgress}
              isDetailInputMode={isDetailInputMode}
              isShiftInputMode={isShiftInputMode}
              onSelectDate={setTargetDate}
              onSelectNextDay={selectNextDay}
              onToggleShiftInputMode={toggleShiftInputMode}
              selectedDate={selectedDate}
              selectedDateShifts={selectedDateShifts}
              shiftNotesByShiftId={shiftNotesByShiftId}
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
                  selectedDateShift={selectedDateShift}
                  selectedDateShiftNote={selectedDateShiftNote}
                  shiftNotesByShiftId={shiftNotesByShiftId}
                  shifts={shifts}
                />
              ) : (
                <ShiftDetailView
                  bottomContentPadding={bottomContentPadding}
                  membersById={membersById}
                  patternsById={patternsById}
                  selectedDateShift={selectedDateShift}
                  selectedDateShiftNote={selectedDateShiftNote}
                />
              )}
            </View>
          </View>
        </GestureDetector>
      </KeyboardAvoidingView>
    </View>
  );
}
