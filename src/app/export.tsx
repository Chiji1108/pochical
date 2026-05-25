import {
  endOfMonth,
  format,
  isValid,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import { useLocalSearchParams, useRouter } from "expo-router";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { SymbolView } from "expo-symbols";
import { Tabs, useToast } from "heroui-native";
import { Button } from "heroui-native/button";
import { useMemo, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";
import type {
  CalendarShiftSummary,
  ExportCalendarColorScheme,
} from "@/components/calendar/calendar-body";
import { ExportCalendarImageView } from "@/components/calendar/export-calendar-image-view";
import { AppHeader } from "@/components/navigation/app-header";
import { useAppSettings } from "@/lib/app-settings";
import { type Pattern, useCurrentUserId, useOwnWorkData } from "@/lib/instant";

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
  const { toast } = useToast();
  const { settings } = useAppSettings();
  const currentUserId = useCurrentUserId();
  const exportCalendarImageRef = useRef<View>(null);
  const [exportColorScheme, setExportColorScheme] =
    useState<ExportCalendarColorScheme>("light");
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const yearMonth = useMemo(
    () => getInitialYearMonth(params.yearMonth),
    [params.yearMonth]
  );
  const workDataDateRange = useMemo(
    () => ({
      end: endOfMonth(yearMonth),
      start: startOfMonth(yearMonth),
    }),
    [yearMonth]
  );
  const { patterns, shifts } = useOwnWorkData(currentUserId, workDataDateRange);
  const monthLabel = format(yearMonth, "yyyy年M月");
  const patternsById = useMemo(() => {
    const nextPatternsById = new Map<string, Pattern>();

    for (const pattern of patterns) {
      nextPatternsById.set(pattern.id, pattern);
    }

    return nextPatternsById;
  }, [patterns]);
  const shiftsByDate = useMemo(() => {
    const nextShiftsByDate = new Map<number, CalendarShiftSummary>();

    for (const shift of shifts) {
      const dateKey = startOfDay(shift.startDate).getTime();

      nextShiftsByDate.set(dateKey, {
        hasNotes: Boolean((shift.notes ?? "").trim()),
        pattern: shift.pattern,
      });
    }

    return nextShiftsByDate;
  }, [shifts]);

  const captureImage = async (): Promise<string | undefined> => {
    const captureTarget = exportCalendarImageRef.current;

    if (!captureTarget) {
      toast.show({
        description: "画像にするカレンダーを準備できませんでした。",
        label: "画像を作成できません",
        variant: "danger",
      });
      return;
    }

    try {
      return await captureRef(captureTarget, {
        fileName: `pochical-${monthLabel}`,
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
    } catch {
      toast.show({
        description:
          "カレンダー画像を作成できませんでした。もう一度お試しください。",
        label: "画像を作成できません",
        variant: "danger",
      });
      return;
    }
  };

  const saveImage = async () => {
    if (Platform.OS === "web") {
      toast.show({
        description: "画像保存は iOS / Android で利用できます。",
        label: "保存できません",
        variant: "danger",
      });
      return;
    }

    setIsSaving(true);

    try {
      const imageUri = await captureImage();

      if (!imageUri) {
        return;
      }

      const permission = await requestPermissionsAsync(true);

      if (!permission.granted) {
        toast.show({
          description:
            "写真ライブラリへの保存を許可してから、もう一度お試しください。",
          label: "写真への保存権限が必要です",
          variant: "danger",
        });
        return;
      }

      await Asset.create(imageUri);
      toast.show({
        description: `${monthLabel}のシフト画像を写真ライブラリに保存しました。`,
        label: "保存しました",
        variant: "success",
      });
    } catch {
      toast.show({
        description: "画像を写真ライブラリに保存できませんでした。",
        label: "保存に失敗しました",
        variant: "danger",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const shareImage = async () => {
    setIsSharing(true);

    try {
      const isSharingAvailable = await isAvailableAsync();

      if (!isSharingAvailable) {
        toast.show({
          description: "この環境では画像共有を利用できません。",
          label: "共有できません",
          variant: "danger",
        });
        return;
      }

      const imageUri = await captureImage();

      if (!imageUri) {
        return;
      }

      await shareAsync(imageUri, {
        dialogTitle: `${monthLabel}のシフト画像を共有`,
        mimeType: "image/png",
        UTI: "public.png",
      });
    } catch {
      toast.show({
        description: "画像を共有できませんでした。もう一度お試しください。",
        label: "共有に失敗しました",
        variant: "danger",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const isActionDisabled = isSaving || isSharing;

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
        title="画像で保存"
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: insets.bottom + EXPORT_SCREEN_BOTTOM_PADDING,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="gap-4 px-4 pt-4">
          <View className="items-center">
            <Tabs
              onValueChange={(value) => {
                if (value === "light" || value === "dark") {
                  setExportColorScheme(value);
                }
              }}
              value={exportColorScheme}
              variant="primary"
            >
              <Tabs.List>
                <Tabs.Indicator />
                <Tabs.Trigger value="light">
                  <Tabs.Label>ライト</Tabs.Label>
                </Tabs.Trigger>
                <Tabs.Trigger value="dark">
                  <Tabs.Label>ダーク</Tabs.Label>
                </Tabs.Trigger>
              </Tabs.List>
            </Tabs>
          </View>
          <View className="overflow-hidden rounded-xl border border-border bg-background">
            <View collapsable={false} ref={exportCalendarImageRef}>
              <ExportCalendarImageView
                calendarHighlightTargets={settings.calendarHighlightTargets}
                colorScheme={exportColorScheme}
                patternsById={patternsById}
                shiftsByDate={shiftsByDate}
                weekStartsOn={settings.weekStartsOn}
                yearMonth={yearMonth}
              />
            </View>
          </View>
          <View className="flex-row gap-2">
            <Button
              accessibilityLabel="表示月のシフト画像を保存する"
              className="flex-1"
              isDisabled={isActionDisabled}
              onPress={saveImage}
              variant="outline"
            >
              <SymbolView
                name={{
                  android: "save",
                  ios: "square.and.arrow.down",
                  web: "save",
                }}
                size={18}
              />
              <Button.Label>{isSaving ? "保存中" : "保存"}</Button.Label>
            </Button>
            <Button
              accessibilityLabel="表示月のシフト画像を共有する"
              className="flex-1"
              isDisabled={isActionDisabled}
              onPress={shareImage}
              variant="outline"
            >
              <SymbolView
                name={{
                  android: "share",
                  ios: "square.and.arrow.up",
                  web: "share",
                }}
                size={18}
              />
              <Button.Label>{isSharing ? "共有中" : "共有"}</Button.Label>
            </Button>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
