import {
  FlashList,
  type FlashListRef,
  type ListRenderItem,
} from "@shopify/flash-list";
import {
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { ja } from "date-fns/locale";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import {
  Button,
  Dialog,
  Input,
  Text,
  TextField,
  useThemeColor,
} from "heroui-native";
import { useAll, useDb, useSession } from "jazz-tools/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { AppHeader } from "@/components/navigation/app-header";
import { app, type Pattern, type ShareGroupMember, type Shift } from "@/schema";

const DATE_COLUMN_WIDTH = 64;
const MEMBER_COLUMN_WIDTH = 106;
const DAY_ROW_HEIGHT = 44;
const DATE_COLUMN_LEFT_PADDING = 16;
const INITIAL_MONTH_RADIUS = 12;
const RANGE_CHUNK_MONTHS = 6;
const TABLE_BOTTOM_PADDING = 24;
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";

type CreatedByRow = {
  ownerUserId: string;
};

type DevAddMemberDialogProps = {
  groupId: string;
  isOpen: boolean;
  members: ShareGroupMember[];
  onOpenChange: (isOpen: boolean) => void;
};

type ScheduleDay = {
  date: Date;
  time: number;
};

const getCreatedBy = (row: object): string =>
  (row as CreatedByRow).ownerUserId ?? "";

export default function ShareGroupDetail() {
  const router = useRouter();
  const session = useSession();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(today));
  const [dateRange, setDateRange] = useState(() => ({
    end: addMonths(today, INITIAL_MONTH_RADIUS),
    start: subMonths(today, INITIAL_MONTH_RADIUS),
  }));
  const [isDevAddMemberDialogOpen, setIsDevAddMemberDialogOpen] =
    useState(false);
  const scheduleListRef = useRef<FlashListRef<ScheduleDay>>(null);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 40,
  }).current;
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [highlightBackground, todayColor, borderColor] = useThemeColor([
    "success",
    "accent",
    "border",
  ]);
  const [group] = useAll(app.shareGroups.where({ id: groupId }).limit(1)) ?? [];
  const members =
    useAll(app.shareGroupMembers.where({ groupId }).orderBy("displayName")) ??
    [];
  const shifts = useAll(app.shifts) ?? [];
  const patterns = useAll(app.patterns) ?? [];
  const ownMembership = members.find(
    (member) => member.user_id === session?.user_id
  );
  const memberUserIds = useMemo(
    () => new Set(members.map((member) => member.user_id)),
    [members]
  );
  const patternsById = useMemo(() => {
    const nextPatternsById = new Map<string, Pattern>();

    for (const pattern of patterns) {
      nextPatternsById.set(pattern.id, pattern);
    }

    return nextPatternsById;
  }, [patterns]);
  const shiftsByUserAndDate = useMemo(() => {
    const nextShiftsByUserAndDate = new Map<string, Shift>();

    for (const shift of shifts) {
      const createdBy = getCreatedBy(shift);

      if (!memberUserIds.has(createdBy)) {
        continue;
      }

      const key = `${createdBy}:${startOfDay(shift.startDate).getTime()}`;
      nextShiftsByUserAndDate.set(key, shift);
    }

    return nextShiftsByUserAndDate;
  }, [memberUserIds, shifts]);
  const scheduleDays = useMemo(
    () =>
      eachDayOfInterval(dateRange).map((date) => ({
        date,
        time: startOfDay(date).getTime(),
      })),
    [dateRange]
  );
  const initialScrollIndex = useMemo(
    () => differenceInCalendarDays(today, dateRange.start),
    [dateRange.start, today]
  );
  const todayIndex = initialScrollIndex;
  const tableWidth = DATE_COLUMN_WIDTH + members.length * MEMBER_COLUMN_WIDTH;

  const prependDays = useCallback(() => {
    setDateRange((currentRange) => ({
      ...currentRange,
      start: subMonths(currentRange.start, RANGE_CHUNK_MONTHS),
    }));
  }, []);

  const appendDays = useCallback(() => {
    setDateRange((currentRange) => ({
      ...currentRange,
      end: addMonths(currentRange.end, RANGE_CHUNK_MONTHS),
    }));
  }, []);

  const updateVisibleMonth = useCallback(
    ({ viewableItems }: { viewableItems: { item?: ScheduleDay }[] }) => {
      const firstVisibleDay = viewableItems[0]?.item;

      if (!firstVisibleDay) {
        return;
      }

      setVisibleMonth((currentMonth) => {
        const nextMonth = startOfMonth(firstVisibleDay.date);
        return currentMonth.getTime() === nextMonth.getTime()
          ? currentMonth
          : nextMonth;
      });
    },
    []
  );

  const scrollToToday = useCallback(() => {
    scheduleListRef.current?.scrollToIndex({
      animated: true,
      index: todayIndex,
      viewPosition: 0.35,
    });
    setVisibleMonth(startOfMonth(today));
  }, [today, todayIndex]);

  const renderScheduleDay = useCallback<ListRenderItem<ScheduleDay>>(
    ({ item }) => {
      const cells = members.map((member) => {
        const key = `${member.user_id}:${item.time}`;
        const shift = shiftsByUserAndDate.get(key);
        const pattern = shift ? patternsById.get(shift.patternId) : undefined;

        return { member, pattern, shift };
      });
      const isEveryoneOff = cells.every(
        ({ pattern, shift }) => !shift || pattern?.countsAsDayOff
      );
      const isToday = item.time === today.getTime();
      let rowBackgroundColor: string | undefined;

      if (isEveryoneOff) {
        rowBackgroundColor = `${highlightBackground}22`;
      } else if (isToday) {
        rowBackgroundColor = `${todayColor}16`;
      }

      return (
        <View
          className="flex-row"
          style={{
            backgroundColor: rowBackgroundColor,
            borderLeftColor: isToday ? todayColor : "transparent",
            borderLeftWidth: isToday ? 3 : 0,
            width: tableWidth,
          }}
        >
          <View
            className="flex-row"
            style={{
              width: tableWidth - (isToday ? 3 : 0),
            }}
          >
            <TableBodyCell
              label={format(item.date, "d E", { locale: ja })}
              muted={true}
              paddingLeft={
                isToday
                  ? DATE_COLUMN_LEFT_PADDING - 3
                  : DATE_COLUMN_LEFT_PADDING
              }
              width={DATE_COLUMN_WIDTH - (isToday ? 3 : 0)}
            />
            {cells.map(({ member, pattern, shift }) => (
              <TableBodyCell
                key={member.id}
                label={shift ? (pattern?.name ?? "不明") : "未設定"}
                muted={!shift}
                prefix={pattern?.emoji}
                width={MEMBER_COLUMN_WIDTH}
              />
            ))}
          </View>
        </View>
      );
    },
    [
      highlightBackground,
      members,
      patternsById,
      shiftsByUserAndDate,
      tableWidth,
      today,
      todayColor,
    ]
  );

  if (!group) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader
          leftAction={{
            accessibilityLabel: "グループ一覧に戻る",
            icon: {
              android: "arrow_back",
              ios: "chevron.left",
              web: "arrow_back",
            },
            label: "戻る",
            onPress: () => {
              router.back();
            },
          }}
          title="グループ"
        />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-base" color="muted">
            グループが見つかりません
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        leftAction={{
          accessibilityLabel: "グループ一覧に戻る",
          icon: {
            android: "arrow_back",
            ios: "chevron.left",
            web: "arrow_back",
          },
          label: "戻る",
          onPress: () => {
            router.back();
          },
        }}
        rightActions={[
          {
            accessibilityLabel: "今日へ移動",
            icon: {
              android: "undo",
              ios: "arrow.uturn.backward",
              web: "undo",
            },
            label: "今日",
            onPress: scrollToToday,
            variant: "outline",
          },
        ]}
        title={group.name}
      />
      <View className="flex-1">
        {members.length > 0 ? (
          <View className="flex-1">
            <ScrollView
              contentContainerStyle={{ flexGrow: 1 }}
              horizontal={true}
              showsHorizontalScrollIndicator={true}
            >
              <View className="flex-1" style={{ width: tableWidth }}>
                <View className="flex-row">
                  <TableHeaderCell
                    label={format(visibleMonth, "M月", { locale: ja })}
                    paddingLeft={DATE_COLUMN_LEFT_PADDING}
                    width={DATE_COLUMN_WIDTH}
                  />
                  {members.map((member) => (
                    <TableHeaderCell
                      key={member.id}
                      label={member.displayName}
                      width={MEMBER_COLUMN_WIDTH}
                    />
                  ))}
                </View>
                <FlashList
                  contentContainerStyle={{
                    paddingBottom: TABLE_BOTTOM_PADDING,
                  }}
                  data={scheduleDays}
                  drawDistance={DAY_ROW_HEIGHT * 12}
                  initialScrollIndex={initialScrollIndex}
                  keyExtractor={(item) => String(item.time)}
                  maintainVisibleContentPosition={{
                    autoscrollToBottomThreshold: 0.01,
                    autoscrollToTopThreshold: 0.01,
                  }}
                  onEndReached={appendDays}
                  onEndReachedThreshold={0.4}
                  onStartReached={prependDays}
                  onStartReachedThreshold={0.4}
                  onViewableItemsChanged={updateVisibleMonth}
                  ref={scheduleListRef}
                  renderItem={renderScheduleDay}
                  showsVerticalScrollIndicator={true}
                  style={{ flex: 1 }}
                  viewabilityConfig={viewabilityConfig}
                />
              </View>
            </ScrollView>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center text-base" color="muted">
              メンバーがいません
            </Text>
          </View>
        )}
        {IS_DEVELOPMENT && ownMembership ? (
          <View className="border-t px-4 py-3" style={{ borderColor }}>
            <Button
              accessibilityLabel="開発用にuser_idでメンバーを追加"
              onPress={() => {
                setIsDevAddMemberDialogOpen(true);
              }}
              size="sm"
              variant="outline"
            >
              <SymbolView
                name={{
                  android: "person_add",
                  ios: "person.badge.plus",
                  web: "person_add",
                }}
                size={16}
              />
              <Button.Label>user_idで追加</Button.Label>
            </Button>
          </View>
        ) : null}
      </View>
      <DevAddMemberDialog
        groupId={group.id}
        isOpen={isDevAddMemberDialogOpen}
        members={members}
        onOpenChange={setIsDevAddMemberDialogOpen}
      />
    </View>
  );
}

const TableHeaderCell = ({
  label,
  paddingLeft,
  width,
}: {
  label: string;
  paddingLeft?: number;
  width: number;
}) => (
  <View
    className="border-border/70 border-b py-2 pr-2"
    style={{ paddingLeft: paddingLeft ?? 8, width }}
  >
    <Text className="font-semibold text-xs" color="muted" numberOfLines={1}>
      {label}
    </Text>
  </View>
);

const TableBodyCell = ({
  label,
  muted = false,
  paddingLeft,
  prefix,
  width,
}: {
  label: string;
  muted?: boolean;
  paddingLeft?: number;
  prefix?: string;
  width: number;
}) => (
  <View
    className="h-11 justify-center border-border/50 border-b pr-2"
    style={{ paddingLeft: paddingLeft ?? 8, width }}
  >
    <Text
      className="text-sm"
      color={muted ? "muted" : undefined}
      numberOfLines={1}
    >
      {prefix ? `${prefix} ${label}` : label}
    </Text>
  </View>
);

const DevAddMemberDialog = ({
  groupId,
  isOpen,
  members,
  onOpenChange,
}: DevAddMemberDialogProps) => {
  const db = useDb();
  const userIdRef = useRef("");
  const displayNameRef = useRef("");
  const [formKey, setFormKey] = useState(0);
  const memberUserIds = useMemo(
    () => new Set(members.map((member) => member.user_id)),
    [members]
  );

  useEffect(() => {
    if (isOpen) {
      userIdRef.current = "";
      displayNameRef.current = "";
      setFormKey((currentKey) => currentKey + 1);
    }
  }, [isOpen]);

  const submit = () => {
    const trimmedUserId = userIdRef.current.trim();
    const trimmedDisplayName = displayNameRef.current.trim();

    if (!(trimmedUserId && trimmedDisplayName)) {
      Alert.alert("user_idと表示名を入力してください");
      return;
    }

    if (memberUserIds.has(trimmedUserId)) {
      Alert.alert("このuser_idはすでに追加されています");
      return;
    }

    db.batch((batch) => {
      batch.insert(app.shareGroupMembers, {
        displayName: trimmedDisplayName,
        groupId,
        user_id: trimmedUserId,
      });

      for (const member of members) {
        batch.insert(app.shareGroupAccess, {
          groupId,
          ownerUserId: member.user_id,
          viewerUserId: trimmedUserId,
        });
        batch.insert(app.shareGroupAccess, {
          groupId,
          ownerUserId: trimmedUserId,
          viewerUserId: member.user_id,
        });
      }
    });
    onOpenChange(false);
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Dialog.Content>
            <Dialog.Close variant="ghost" />
            <View className="mb-5 gap-1.5">
              <Dialog.Title>メンバーを追加</Dialog.Title>
            </View>
            <View className="gap-4">
              <TextField>
                <Input
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus={true}
                  defaultValue=""
                  key={`user-id-${formKey}`}
                  onChangeText={(text) => {
                    userIdRef.current = text;
                  }}
                  placeholder="user_id"
                  returnKeyType="next"
                />
              </TextField>
              <TextField>
                <Input
                  autoCapitalize="none"
                  autoCorrect={false}
                  defaultValue=""
                  key={`display-name-${formKey}`}
                  onChangeText={(text) => {
                    displayNameRef.current = text;
                  }}
                  onSubmitEditing={submit}
                  placeholder="表示名"
                  returnKeyType="done"
                />
              </TextField>
            </View>
            <View className="mt-5 flex-row justify-end gap-3">
              <Button
                onPress={() => {
                  onOpenChange(false);
                }}
                size="sm"
                variant="ghost"
              >
                <Button.Label>キャンセル</Button.Label>
              </Button>
              <Button onPress={submit} size="sm" variant="primary">
                <Button.Label>追加</Button.Label>
              </Button>
            </View>
          </Dialog.Content>
        </KeyboardAvoidingView>
      </Dialog.Portal>
    </Dialog>
  );
};
