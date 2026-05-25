import { useMutation } from "convex/react";
import { getDate, isSameMonth, startOfMonth } from "date-fns";
import { useRouter } from "expo-router";
import { deleteItemAsync } from "expo-secure-store";
import { SymbolView } from "expo-symbols";
import {
  ListGroup,
  PressableFeedback,
  Select,
  Separator,
  TagGroup,
  Text,
  useToast,
} from "heroui-native";
import { useMemo, useRef, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { useCurrentUserId, useOwnWorkData } from "@/lib/instant";
import { cn } from "@/lib/utils";
import { deleteWorkData } from "@/lib/work-data-actions";
import { api as convexApi } from "../../../convex/_generated/api";

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
const SELECTED_GROUP_STORAGE_KEY = "pochical-selected-group-id";

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
  const router = useRouter();
  const { toast } = useToast();
  const leaveAllGroupsMutation = useMutation(
    convexApi.groups.leaveAllForCurrentUser
  );
  const isResettingAppDataRef = useRef(false);
  const [isResettingAppData, setIsResettingAppData] = useState(false);
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
  const isDangerActionDisabled = !currentUserId || isResettingAppData;

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

  const confirmResetAppData = () => {
    if (!(currentUserId && !isResettingAppDataRef.current)) {
      return;
    }

    Alert.alert(
      "アプリのデータをリセットしますか？",
      "カレンダーをリセットし、すべてのグループから脱退します。自分だけのグループは削除されます。この操作は取り消せません。",
      [
        { style: "cancel", text: "キャンセル" },
        {
          onPress: async () => {
            isResettingAppDataRef.current = true;
            setIsResettingAppData(true);

            try {
              await deleteWorkData({
                members,
                patterns,
                shifts,
              });
              await leaveAllGroupsMutation({ instantUserId: currentUserId });
              await deleteItemAsync(SELECTED_GROUP_STORAGE_KEY);
              router.replace("/settings");
              toast.show({
                description:
                  "カレンダーをリセットし、すべてのグループから脱退しました。",
                label: "アプリのデータをリセットしました",
                variant: "success",
              });
            } catch (error) {
              Alert.alert(
                "リセットできませんでした",
                error instanceof Error
                  ? error.message
                  : "時間をおいて再試行してください"
              );
            } finally {
              isResettingAppDataRef.current = false;
              setIsResettingAppData(false);
            }
          },
          style: "destructive",
          text: "リセット",
        },
      ],
      {
        cancelable: false,
      }
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
          <ListGroup>
            <PlaceholderRow
              description="機種変更に備えてアカウントへ紐付けます"
              label="アカウントを紐付け"
            />
            <Separator className="mx-4" />
            <PlaceholderRow
              description="現在の端末からアカウント連携を外します"
              label="紐付け解除"
            />
          </ListGroup>
        </View>

        <View className="gap-2">
          <SectionTitle>危険な操作</SectionTitle>
          <ListGroup>
            <DestructiveSettingRow
              description="すべてのシフト、シフトパターン、勤務メンバー、メモを削除します。グループは残ります"
              isDisabled={isDangerActionDisabled}
              label="カレンダーをリセット"
              onPress={confirmDeleteWorkData}
            />
            <Separator className="mx-4" />
            <DestructiveSettingRow
              description="カレンダーをリセットし、すべてのグループから脱退します。自分だけのグループは削除されます"
              isDisabled={isDangerActionDisabled}
              label={
                isResettingAppData
                  ? "リセットしています"
                  : "アプリのデータをリセット"
              }
              onPress={confirmResetAppData}
            />
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
  <Text className="px-1 font-semibold text-sm" color="muted">
    {children}
  </Text>
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
        ? Array.from({ length: 7 }, (_, index) => {
            const date = new Date(firstWeek);
            date.setDate(firstWeek.getDate() + index);
            return date;
          })
        : [],
    [firstWeek]
  );

  return (
    <View className="w-full items-center py-1">
      <View className="aspect-square w-48 justify-center rounded-lg bg-background p-4 shadow-surface">
        <View className="flex-row">
          {weekdayDates.map((date) => {
            const highlightColor = getCalendarWeekdayHighlightColor(
              date,
              calendarHighlightTargets
            );

            return (
              <View
                className="aspect-square flex-1 items-center justify-center"
                key={date.toISOString()}
              >
                <Text
                  className={cn("font-semibold text-[10px] leading-none", {
                    "text-blue-500": highlightColor === "blue",
                    "text-red-500": highlightColor === "red",
                  })}
                >
                  {date.toLocaleDateString("ja-JP", { weekday: "short" })}
                </Text>
              </View>
            );
          })}
        </View>
        {weeks.map((week) => (
          <CalendarPreviewWeek
            calendarHighlightTargets={calendarHighlightTargets}
            key={week.toISOString()}
            previewMonth={previewMonth}
            week={week}
          />
        ))}
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
    {Array.from({ length: 7 }, (_, index) => {
      const date = new Date(week);
      date.setDate(week.getDate() + index);
      const highlightColor = getCalendarDateHighlightColor(
        date,
        calendarHighlightTargets
      );

      return (
        <View
          className="aspect-square flex-1 items-center justify-center"
          key={date.toISOString()}
        >
          <Text
            className={cn("font-medium text-[10px] leading-none", {
              "opacity-30": !isSameMonth(date, previewMonth),
              "text-blue-500": highlightColor === "blue",
              "text-red-500": highlightColor === "red",
            })}
          >
            {getDate(date)}
          </Text>
        </View>
      );
    })}
  </View>
);

type PlaceholderRowProps = {
  description: string;
  label: string;
};

const PlaceholderRow = ({ description, label }: PlaceholderRowProps) => (
  <ListGroup.Item disabled>
    <ListGroup.ItemContent>
      <ListGroup.ItemTitle>{label}</ListGroup.ItemTitle>
      <ListGroup.ItemDescription>{description}</ListGroup.ItemDescription>
    </ListGroup.ItemContent>
    <ListGroup.ItemSuffix>
      <Text className="text-xs" color="muted">
        準備中
      </Text>
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
