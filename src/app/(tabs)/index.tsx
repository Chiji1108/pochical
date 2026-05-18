import {
  addDays,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { selectionAsync } from "expo-haptics";
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
import {
  ExportCalendarDialog,
  type ExportDialogResult,
} from "@/components/calendar/export-calendar-dialog";
import { PatternGridHeader } from "@/components/pattern/pattern-grid-header";
import { PatternGridView } from "@/components/pattern/pattern-grid-view";
import { ShiftDetailView } from "@/components/shift/shift-detail-view";
import { getMonthlyShiftCalendarEvents } from "@/lib/calendar-export";
import {
  addEventsToDeviceCalendar,
  type CalendarSelectOption,
  getCalendarSelectOptions,
  getWritableCalendars,
} from "@/lib/device-calendar";
import { app, type Member, type Pattern, type ShiftNote } from "@/schema";

const DETAIL_PAGE_DRAG_DISTANCE = 180;
const DETAIL_PAGE_SETTLE_THRESHOLD = 0.45;
const DETAIL_PAGE_SWIPE_VELOCITY = 600;
const DETAIL_PAGE_TRANSITION_DURATION = 220;
const TAB_OVERLAP_PADDING = 36;

export default function Index() {
  const insets = useSafeAreaInsets();
  const [excludeDayOffShiftsFromExport, setExcludeDayOffShiftsFromExport] =
    useState(true);
  const [calendarSelectOptions, setCalendarSelectOptions] = useState<
    CalendarSelectOption[]
  >([]);
  const [exportDialogResult, setExportDialogResult] =
    useState<ExportDialogResult>();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
  const [isExportingMonth, setIsExportingMonth] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>();
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
        excludeDayOffShifts: excludeDayOffShiftsFromExport,
        membersById,
        patternsById,
        shiftNotesByShiftId,
        shifts,
        yearMonth,
      }),
    [
      excludeDayOffShiftsFromExport,
      membersById,
      patternsById,
      shiftNotesByShiftId,
      shifts,
      yearMonth,
    ]
  );
  const monthLabel = format(yearMonth, "yyyy年M月");
  const selectedCalendarOption = useMemo(
    () =>
      calendarSelectOptions.find(
        (option) => option.value === selectedCalendarId
      ),
    [calendarSelectOptions, selectedCalendarId]
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

  const loadWritableCalendars = async () => {
    setIsLoadingCalendars(true);

    try {
      const writableCalendars = await getWritableCalendars();

      if (!writableCalendars) {
        setCalendarSelectOptions([]);
        setSelectedCalendarId(undefined);
        setExportDialogResult({
          message:
            "端末のカレンダーへのアクセスを許可してから、もう一度お試しください。",
          title: "カレンダー権限が必要です",
        });
        return;
      }

      const nextOptions = getCalendarSelectOptions(writableCalendars);

      setCalendarSelectOptions(nextOptions);
      setSelectedCalendarId((currentCalendarId) =>
        nextOptions.some((option) => option.value === currentCalendarId)
          ? currentCalendarId
          : nextOptions[0]?.value
      );

      if (nextOptions.length === 0) {
        setExportDialogResult({
          message:
            "書き込み可能な端末カレンダーが見つかりませんでした。端末のカレンダー設定を確認してください。",
          title: "追加先カレンダーがありません",
        });
      }
    } catch {
      setCalendarSelectOptions([]);
      setSelectedCalendarId(undefined);
      setExportDialogResult({
        message:
          "端末カレンダーの一覧を取得できませんでした。カレンダー設定を確認してから、もう一度お試しください。",
        title: "追加先カレンダーを取得できません",
      });
    } finally {
      setIsLoadingCalendars(false);
    }
  };

  const exportMonthlyShifts = async () => {
    if (Platform.OS === "web") {
      setExportDialogResult({
        message:
          "端末のカレンダーアプリへの追加は iOS / Android で利用できます。",
        title: "端末カレンダーに追加できません",
      });
      return;
    }

    if (monthlyShiftCalendarEvents.length === 0) {
      setExportDialogResult({
        message: "表示中の月に追加対象のシフトがありません。",
        title: "追加するシフトがありません",
      });
      return;
    }

    setIsExportingMonth(true);

    try {
      if (!selectedCalendarId) {
        setExportDialogResult({
          message:
            "追加先の端末カレンダーを選択してから、もう一度お試しください。",
          title: "追加先カレンダーが必要です",
        });
        return;
      }

      await addEventsToDeviceCalendar(
        selectedCalendarId,
        monthlyShiftCalendarEvents
      );

      setExportDialogResult({
        message: `${format(yearMonth, "yyyy年M月")}のシフト ${monthlyShiftCalendarEvents.length}件を端末カレンダーに追加しました。`,
        title: "追加しました",
      });
    } catch {
      setExportDialogResult({
        message:
          "端末カレンダーに予定を追加できませんでした。カレンダー設定を確認してから、もう一度お試しください。",
        title: "追加に失敗しました",
      });
    } finally {
      setIsExportingMonth(false);
    }
  };

  const confirmExportMonthlyShifts = () => {
    setCalendarSelectOptions([]);
    setExportDialogResult(undefined);
    setIsExportDialogOpen(true);
    loadWritableCalendars().catch(() => {
      setExportDialogResult({
        message:
          "端末カレンダーの一覧を取得できませんでした。カレンダー設定を確認してから、もう一度お試しください。",
        title: "追加先カレンダーを取得できません",
      });
    });
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
          onExportMonth={confirmExportMonthlyShifts}
          onPressToday={returnToToday}
          onSelectDate={setTargetDate}
          selectedDate={selectedDate}
          yearMonth={yearMonth}
        />
      </View>
      <ExportCalendarDialog
        calendarSelectOptions={calendarSelectOptions}
        excludeDayOffShiftsFromExport={excludeDayOffShiftsFromExport}
        exportDialogResult={exportDialogResult}
        isExportingMonth={isExportingMonth}
        isLoadingCalendars={isLoadingCalendars}
        isOpen={isExportDialogOpen}
        monthLabel={monthLabel}
        onChangeExcludeDayOffShiftsFromExport={setExcludeDayOffShiftsFromExport}
        onChangeOpen={setIsExportDialogOpen}
        onChangeSelectedCalendarId={setSelectedCalendarId}
        onExport={exportMonthlyShifts}
        onExportError={() => {
          setExportDialogResult({
            message:
              "端末カレンダーに予定を追加できませんでした。カレンダー設定を確認してから、もう一度お試しください。",
            title: "追加に失敗しました",
          });
        }}
        selectedCalendarId={selectedCalendarId}
        selectedCalendarOption={selectedCalendarOption}
        shiftCount={monthlyShiftCalendarEvents.length}
      />
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
