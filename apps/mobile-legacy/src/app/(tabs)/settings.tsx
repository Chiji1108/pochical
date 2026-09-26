import { getDate, isSameMonth, startOfMonth } from "date-fns";
import { SymbolView } from "expo-symbols";
import {
  ListGroup,
  PressableFeedback,
  Select,
  Separator,
  TagGroup,
  Typography,
  useToast,
} from "heroui-native";
import { useMemo } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountDeletionSetting } from "@/components/account-deletion-setting";
import { AccountSettings } from "@/components/account-settings";
import { AppHeader } from "@/components/navigation/app-header";
import {
  type CalendarHighlightTarget,
  useAppSettings,
  type WeekStartsOn,
} from "@/lib/app-settings";
import {
  getCalendarDateHighlightColor,
  getCalendarWeekdayHighlightColor,
  getWeeksOfMonth,
} from "@/lib/date";
import { cn } from "@/lib/utils";
import { useCurrentUserId, useOwnWorkData } from "@/lib/work-data";
import { deleteWorkData } from "@/lib/work-data-actions";

type WeekStartOption = {
  id: WeekStartsOn;
  label: string;
};

type HighlightOption = {
  id: CalendarHighlightTarget;
  label: string;
};

const WEEK_START_OPTIONS: WeekStartOption[] = [
  { id: 0, label: "日曜" },
  { id: 1, label: "月曜" },
  { id: 2, label: "火曜" },
  { id: 3, label: "水曜" },
  { id: 4, label: "木曜" },
  { id: 5, label: "金曜" },
  { id: 6, label: "土曜" },
];

const HIGHLIGHT_OPTIONS: HighlightOption[] = [
  { id: "holiday", label: "祝日" },
  { id: "sunday", label: "日" },
  { id: "saturday", label: "土" },
];

const ORDERED_HIGHLIGHT_TARGETS = HIGHLIGHT_OPTIONS.map((option) => option.id);
// Preview keys identify fixed grid positions so changing dates reuses the cells.
const PREVIEW_WEEK_SLOTS = [0, 1, 2, 3, 4, 5] as const;
const PREVIEW_DAY_SLOTS = [0, 1, 2, 3, 4, 5, 6] as const;

const getOrderedHighlightTargets = (
  targets: Iterable<string>
): CalendarHighlightTarget[] => {
  const selectedTargets = new Set(targets);

  return ORDERED_HIGHLIGHT_TARGETS.filter((target) =>
    selectedTargets.has(target)
  );
};

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  const { settings, setCalendarHighlightTargets, setWeekStartsOn } =
    useAppSettings();
  const currentUserId = useCurrentUserId();
  const { members, patterns, shifts } = useOwnWorkData(currentUserId);
  const selectedWeekStartOption = WEEK_START_OPTIONS.find(
    (option) => option.id === settings.weekStartsOn
  );
  const selectedHighlightKeys = new Set<string>(
    settings.calendarHighlightTargets
  );

  const confirmDeleteWorkData = () => {
    if (!currentUserId) {
      return;
    }

    Alert.alert(
      "カレンダーをリセットしますか？",
      "すべてのシフト、シフトパターン、勤務メンバー、メモが削除されます。グループとチャットは残ります。この操作は取り消せません。",
      [
        { style: "cancel", text: "キャンセル" },
        {
          onPress: async () => {
            try {
              await deleteWorkData({
                members,
                patterns,
                shifts,
              });
              toast.show({
                description:
                  "シフト、シフトパターン、勤務メンバー、メモを削除しました。",
                label: "カレンダーをリセットしました",
                variant: "success",
              });
            } catch (error) {
              Alert.alert(
                "リセットできませんでした",
                error instanceof Error
                  ? error.message
                  : "時間をおいて再試行してください"
              );
            }
          },
          style: "destructive",
          text: "リセット",
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-background">
      <AppHeader title="設定" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-4 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="gap-2">
          <SectionTitle>表示</SectionTitle>
          <ListGroup>
            <ListGroup.Item className="items-start">
              <ListGroup.ItemContent>
                <CalendarPreview
                  calendarHighlightTargets={settings.calendarHighlightTargets}
                  weekStartsOn={settings.weekStartsOn}
                />
              </ListGroup.ItemContent>
            </ListGroup.Item>
            <Separator className="mx-4" />
            <ListGroup.Item>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>週の開始曜日</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix className="min-w-24">
                <Select
                  onValueChange={async (option) => {
                    const selectedWeekStartsOn = Number(option?.value);

                    if (isWeekStartsOn(selectedWeekStartsOn)) {
                      await setWeekStartsOn(selectedWeekStartsOn);
                    }
                  }}
                  presentation="bottom-sheet"
                  value={
                    selectedWeekStartOption
                      ? {
                          label: selectedWeekStartOption.label,
                          value: String(selectedWeekStartOption.id),
                        }
                      : undefined
                  }
                >
                  <Select.Trigger>
                    <Select.Value placeholder="選択" />
                    <Select.TriggerIndicator />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Overlay />
                    <Select.Content presentation="bottom-sheet">
                      {WEEK_START_OPTIONS.map((option) => (
                        <Select.Item
                          key={option.id}
                          label={option.label}
                          value={String(option.id)}
                        />
                      ))}
                    </Select.Content>
                  </Select.Portal>
                </Select>
              </ListGroup.ItemSuffix>
            </ListGroup.Item>
            <Separator className="mx-4" />
            <ListGroup.Item>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>ハイライト</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix>
                <TagGroup
                  onSelectionChange={async (keys) => {
                    await setCalendarHighlightTargets(
                      getOrderedHighlightTargets(Array.from(keys).map(String))
                    );
                  }}
                  selectedKeys={selectedHighlightKeys}
                  selectionMode="multiple"
                  size="md"
                >
                  <TagGroup.List>
                    {HIGHLIGHT_OPTIONS.map((option) => (
                      <TagGroup.Item id={option.id} key={option.id}>
                        {({ isSelected }) => (
                          <>
                            <SymbolView
                              name={{
                                android: isSelected ? "check" : "add",
                                ios: isSelected ? "checkmark" : "plus",
                                web: isSelected ? "check" : "add",
                              }}
                              size={11}
                            />
                            <TagGroup.ItemLabel>
                              {option.label}
                            </TagGroup.ItemLabel>
                          </>
                        )}
                      </TagGroup.Item>
                    ))}
                  </TagGroup.List>
                </TagGroup>
              </ListGroup.ItemSuffix>
            </ListGroup.Item>
          </ListGroup>
        </View>

        <View className="gap-2">
          <SectionTitle>アカウント</SectionTitle>
          <AccountSettings />
        </View>

        <View className="gap-2">
          <SectionTitle>データ管理</SectionTitle>
          <ListGroup>
            <DestructiveSettingRow
              description="すべてのシフト、シフトパターン、勤務メンバー、メモを削除します。グループは残ります"
              isDisabled={!currentUserId}
              label="カレンダーの全データを削除"
              onPress={confirmDeleteWorkData}
            />
            <Separator className="mx-4" />
            <AccountDeletionSetting />
          </ListGroup>
        </View>
      </ScrollView>
    </View>
  );
}

type SectionTitleProps = {
  children: string;
};

const SectionTitle = ({ children }: SectionTitleProps) => (
  <Typography className="px-1 font-semibold text-sm" color="muted">
    {children}
  </Typography>
);

const isWeekStartsOn = (value: number): value is WeekStartsOn =>
  Number.isInteger(value) && value >= 0 && value <= 6;

type CalendarPreviewProps = {
  calendarHighlightTargets: CalendarHighlightTarget[];
  weekStartsOn: WeekStartsOn;
};

const CalendarPreview = ({
  calendarHighlightTargets,
  weekStartsOn,
}: CalendarPreviewProps) => {
  const previewMonth = useMemo(() => startOfMonth(new Date()), []);
  const weeks = useMemo(
    () => getWeeksOfMonth(previewMonth, { weekStartsOn }),
    [previewMonth, weekStartsOn]
  );
  const [firstWeek] = weeks;
  const weekdayDates = useMemo(
    () =>
      firstWeek
        ? PREVIEW_DAY_SLOTS.map((column) => {
            const date = new Date(firstWeek);
            date.setDate(firstWeek.getDate() + column);
            return { column, date };
          })
        : [],
    [firstWeek]
  );

  return (
    <View className="w-full items-center py-1">
      <View className="aspect-square w-48 justify-center rounded-lg bg-background p-4 shadow-surface">
        <View className="flex-row">
          {weekdayDates.map(({ column, date }) => {
            const highlightColor = getCalendarWeekdayHighlightColor(
              date,
              calendarHighlightTargets
            );

            return (
              <View
                className="aspect-square flex-1 items-center justify-center"
                key={column}
              >
                <Typography
                  className={cn("font-semibold text-[10px] leading-none", {
                    "text-blue-500": highlightColor === "blue",
                    "text-red-500": highlightColor === "red",
                  })}
                >
                  {date.toLocaleDateString("ja-JP", { weekday: "short" })}
                </Typography>
              </View>
            );
          })}
        </View>
        {PREVIEW_WEEK_SLOTS.map((row) => {
          const week = weeks[row];

          return week ? (
            <CalendarPreviewWeek
              calendarHighlightTargets={calendarHighlightTargets}
              key={row}
              previewMonth={previewMonth}
              week={week}
            />
          ) : null;
        })}
      </View>
    </View>
  );
};

type CalendarPreviewWeekProps = {
  calendarHighlightTargets: CalendarHighlightTarget[];
  previewMonth: Date;
  week: Date;
};

const CalendarPreviewWeek = ({
  calendarHighlightTargets,
  previewMonth,
  week,
}: CalendarPreviewWeekProps) => (
  <View className="flex-row">
    {PREVIEW_DAY_SLOTS.map((column) => {
      const date = new Date(week);
      date.setDate(week.getDate() + column);
      const highlightColor = getCalendarDateHighlightColor(
        date,
        calendarHighlightTargets
      );

      return (
        <View
          className="aspect-square flex-1 items-center justify-center"
          key={column}
        >
          <Typography
            className={cn("font-medium text-[10px] leading-none", {
              "opacity-30": !isSameMonth(date, previewMonth),
              "text-blue-500": highlightColor === "blue",
              "text-red-500": highlightColor === "red",
            })}
          >
            {getDate(date)}
          </Typography>
        </View>
      );
    })}
  </View>
);

type PlaceholderRowProps = {
  description: string;
  label: string;
};

const _PlaceholderRow = ({ description, label }: PlaceholderRowProps) => (
  <ListGroup.Item disabled>
    <ListGroup.ItemContent>
      <ListGroup.ItemTitle>{label}</ListGroup.ItemTitle>
      <ListGroup.ItemDescription>{description}</ListGroup.ItemDescription>
    </ListGroup.ItemContent>
    <ListGroup.ItemSuffix>
      <Typography className="text-xs" color="muted">
        準備中
      </Typography>
    </ListGroup.ItemSuffix>
  </ListGroup.Item>
);

type DestructiveSettingRowProps = {
  description: string;
  isDisabled: boolean;
  label: string;
  onPress: () => void;
};

const DestructiveSettingRow = ({
  description,
  isDisabled,
  label,
  onPress,
}: DestructiveSettingRowProps) => (
  <PressableFeedback
    animation={false}
    isDisabled={isDisabled}
    onPress={onPress}
  >
    <PressableFeedback.Scale>
      <ListGroup.Item disabled={isDisabled}>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle className="text-danger">
            {label}
          </ListGroup.ItemTitle>
          <ListGroup.ItemDescription>{description}</ListGroup.ItemDescription>
        </ListGroup.ItemContent>
      </ListGroup.Item>
    </PressableFeedback.Scale>
    <PressableFeedback.Ripple />
  </PressableFeedback>
);
