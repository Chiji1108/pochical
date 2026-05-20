import { format, isValid, startOfDay, startOfMonth } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Button } from "heroui-native/button";
import { useAll, useSession } from "jazz-tools/react-native";
import { useMemo, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CalendarShiftSummary } from "@/components/calendar/calendar-body";
import {
  ExportCalendarDialog,
  type ExportDialogResult,
} from "@/components/calendar/export-calendar-dialog";
import { ExportCalendarImageView } from "@/components/calendar/export-calendar-image-view";
import { ExportImageDialog } from "@/components/calendar/export-image-dialog";
import { AppHeader } from "@/components/navigation/app-header";
import { useAppSettings } from "@/lib/app-settings";
import { getMonthlyShiftCalendarEvents } from "@/lib/calendar-export";
import {
  addEventsToDeviceCalendar,
  type CalendarSelectOption,
  getCalendarSelectOptions,
  getWritableCalendars,
} from "@/lib/device-calendar";
import { app, type DayNote, type Member, type Pattern } from "@/schema";

const EXPORT_SCREEN_BOTTOM_PADDING = 24;

const getInitialYearMonth = (yearMonthParam?: string): Date => {
  if (!yearMonthParam) {
    return startOfMonth(new Date());
  }

  const parsedDate = new Date(yearMonthParam);
  return isValid(parsedDate)
    ? startOfMonth(parsedDate)
    : startOfMonth(new Date());
};

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ yearMonth?: string }>();
  const { settings } = useAppSettings();
  const session = useSession();
  const currentUserId = session?.user_id ?? "";
  const exportCalendarImageRef = useRef<View>(null);
  const [calendarSelectOptions, setCalendarSelectOptions] = useState<
    CalendarSelectOption[]
  >([]);
  const [excludeDayOffShiftsFromExport, setExcludeDayOffShiftsFromExport] =
    useState(true);
  const [exportDialogResult, setExportDialogResult] =
    useState<ExportDialogResult>();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExportImageDialogOpen, setIsExportImageDialogOpen] = useState(false);
  const [isExportingMonth, setIsExportingMonth] = useState(false);
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>();
  const yearMonth = useMemo(
    () => getInitialYearMonth(params.yearMonth),
    [params.yearMonth]
  );
  const monthLabel = format(yearMonth, "yyyy年M月");
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
  const monthlyShiftCalendarEvents = useMemo(
    () =>
      getMonthlyShiftCalendarEvents({
        dayNotesByDate,
        excludeDayOffShifts: excludeDayOffShiftsFromExport,
        membersById,
        patternsById,
        shifts,
        yearMonth,
      }),
    [
      dayNotesByDate,
      excludeDayOffShiftsFromExport,
      membersById,
      patternsById,
      shifts,
      yearMonth,
    ]
  );
  const selectedCalendarOption = useMemo(
    () =>
      calendarSelectOptions.find(
        (option) => option.value === selectedCalendarId
      ),
    [calendarSelectOptions, selectedCalendarId]
  );

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
        message: `${monthLabel}のシフト ${monthlyShiftCalendarEvents.length}件を端末カレンダーに追加しました。`,
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

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        leftAction={{
          accessibilityLabel: "閉じる",
          label: "閉じる",
          onPress: () => {
            router.back();
          },
        }}
        title="書き出し"
      />
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
      <ExportImageDialog
        captureTargetRef={exportCalendarImageRef}
        isOpen={isExportImageDialogOpen}
        monthLabel={monthLabel}
        onChangeOpen={setIsExportImageDialogOpen}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: insets.bottom + EXPORT_SCREEN_BOTTOM_PADDING,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="gap-4 px-4 pt-4">
          <View className="overflow-hidden rounded-xl border border-border bg-background">
            <View collapsable={false} ref={exportCalendarImageRef}>
              <ExportCalendarImageView
                calendarHighlightTargets={settings.calendarHighlightTargets}
                monthLabel={monthLabel}
                patternsById={patternsById}
                shiftsByDate={shiftsByDate}
                weekStartsOn={settings.weekStartsOn}
                yearMonth={yearMonth}
              />
            </View>
          </View>
          <View className="gap-2">
            <Button
              accessibilityLabel="表示月のシフトを端末カレンダーに追加する"
              isDisabled={isExportingMonth}
              onPress={confirmExportMonthlyShifts}
              variant="outline"
            >
              <SymbolView
                name={{
                  android: "calendar_add_on",
                  ios: "calendar.badge.plus",
                  web: "calendar_add_on",
                }}
                size={18}
              />
              <Button.Label>端末カレンダーに追加</Button.Label>
            </Button>
            <Button
              accessibilityLabel="表示月のシフトを画像で保存する"
              onPress={() => {
                setIsExportImageDialogOpen(true);
              }}
              variant="outline"
            >
              <SymbolView
                name={{
                  android: "image",
                  ios: "photo",
                  web: "image",
                }}
                size={18}
              />
              <Button.Label>画像で保存</Button.Label>
            </Button>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
