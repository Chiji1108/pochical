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
import { Text, useThemeColor } from "heroui-native";
import { useAll } from "jazz-tools/react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { AppHeader } from "@/components/navigation/app-header";
import { app, type Pattern, type Shift } from "@/schema";

const DATE_COLUMN_WIDTH = 58;
const MEMBER_COLUMN_WIDTH = 68;
const DAY_ROW_HEIGHT = 38;
const DATE_COLUMN_LEFT_PADDING = 12;
const CELL_HORIZONTAL_PADDING = 6;
const STRONG_BORDER_ALPHA = "B3";
const SUBTLE_BORDER_ALPHA = "4D";
const INITIAL_MONTH_RADIUS = 12;
const RANGE_CHUNK_MONTHS = 6;
const TABLE_BOTTOM_PADDING = 24;
const TODAY_ROW_VIEW_POSITION = 0.35;

type CreatedByRow = {
  ownerUserId: string;
};

type ScheduleDay = {
  date: Date;
  time: number;
};

type BorderVariant = boolean | "subtle";

const getCreatedBy = (row: object): string =>
  (row as CreatedByRow).ownerUserId ?? "";

export default function ShareGroupDetail() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(today));
  const [dateRange, setDateRange] = useState(() => ({
    end: addMonths(today, INITIAL_MONTH_RADIUS),
    start: subMonths(today, INITIAL_MONTH_RADIUS),
  }));
  const scheduleListRef = useRef<FlashListRef<ScheduleDay>>(null);
  const hasAlignedInitialScrollRef = useRef(false);
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
  const memberColumnWidth =
    members.length > 0
      ? Math.max(
          MEMBER_COLUMN_WIDTH,
          (screenWidth - DATE_COLUMN_WIDTH) / members.length
        )
      : MEMBER_COLUMN_WIDTH;
  const tableWidth = DATE_COLUMN_WIDTH + members.length * memberColumnWidth;

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

  const scrollToTodayIndex = useCallback(
    async (animated: boolean) => {
      await scheduleListRef.current?.scrollToIndex({
        animated,
        index: todayIndex,
        viewPosition: TODAY_ROW_VIEW_POSITION,
      });
      setVisibleMonth(startOfMonth(today));
    },
    [today, todayIndex]
  );

  const alignInitialScrollToToday = useCallback(async () => {
    if (hasAlignedInitialScrollRef.current) {
      return;
    }

    hasAlignedInitialScrollRef.current = true;
    await scrollToTodayIndex(false);
  }, [scrollToTodayIndex]);

  const scrollToToday = useCallback(async () => {
    await scrollToTodayIndex(true);
  }, [scrollToTodayIndex]);

  const renderScheduleDay = useCallback<ListRenderItem<ScheduleDay>>(
    ({ item }) => {
      const cells = members.map((member) => {
        const key = `${member.user_id}:${item.time}`;
        const shift = shiftsByUserAndDate.get(key);
        const pattern = shift ? patternsById.get(shift.patternId) : undefined;

        return { member, pattern, shift };
      });
      const hasRegisteredShift = cells.some(({ shift }) => shift);
      const isEveryoneOff = cells.every(
        ({ pattern, shift }) => !shift || pattern?.countsAsDayOff
      );
      const isToday = item.time === today.getTime();
      let rowBackgroundColor: string | undefined;

      if (hasRegisteredShift && isEveryoneOff) {
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
              borderColor={borderColor}
              label={format(item.date, "d(E)", { locale: ja })}
              muted={true}
              paddingLeft={
                isToday
                  ? DATE_COLUMN_LEFT_PADDING - 3
                  : DATE_COLUMN_LEFT_PADDING
              }
              rightBorder={true}
              width={DATE_COLUMN_WIDTH - (isToday ? 3 : 0)}
            />
            {cells.map(({ member, pattern, shift }, index) => (
              <TableBodyCell
                borderColor={borderColor}
                key={member.id}
                label={shift ? (pattern?.name ?? "不明") : ""}
                muted={!shift}
                prefix={pattern?.emoji}
                rightBorder={index < cells.length - 1 ? "subtle" : false}
                textAlign="center"
                width={memberColumnWidth}
              />
            ))}
          </View>
        </View>
      );
    },
    [
      highlightBackground,
      borderColor,
      memberColumnWidth,
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
                    borderColor={borderColor}
                    label={format(visibleMonth, "M月", { locale: ja })}
                    paddingLeft={DATE_COLUMN_LEFT_PADDING}
                    rightBorder={true}
                    width={DATE_COLUMN_WIDTH}
                  />
                  {members.map((member, index) => (
                    <TableHeaderCell
                      borderColor={borderColor}
                      key={member.id}
                      label={member.displayName}
                      rightBorder={
                        index < members.length - 1 ? "subtle" : false
                      }
                      textAlign="center"
                      width={memberColumnWidth}
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
                  onLoad={alignInitialScrollToToday}
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
      </View>
    </View>
  );
}

const TableHeaderCell = ({
  borderColor,
  label,
  paddingLeft,
  rightBorder = false,
  textAlign = "left",
  width,
}: {
  borderColor: string;
  label: string;
  paddingLeft?: number;
  rightBorder?: BorderVariant;
  textAlign?: "center" | "left";
  width: number;
}) => (
  <View
    className="py-2"
    style={{
      borderBottomColor: `${borderColor}${STRONG_BORDER_ALPHA}`,
      borderBottomWidth: 1,
      borderRightColor: `${borderColor}${
        rightBorder === "subtle" ? SUBTLE_BORDER_ALPHA : STRONG_BORDER_ALPHA
      }`,
      borderRightWidth: rightBorder ? 1 : 0,
      paddingLeft: paddingLeft ?? CELL_HORIZONTAL_PADDING,
      paddingRight: CELL_HORIZONTAL_PADDING,
      width,
    }}
  >
    <Text
      className="font-semibold text-xs"
      color="muted"
      numberOfLines={1}
      style={{ textAlign }}
    >
      {label}
    </Text>
  </View>
);

const TableBodyCell = ({
  borderColor,
  label,
  muted = false,
  paddingLeft,
  prefix,
  rightBorder = false,
  textAlign = "left",
  width,
}: {
  borderColor: string;
  label: string;
  muted?: boolean;
  paddingLeft?: number;
  prefix?: string;
  rightBorder?: BorderVariant;
  textAlign?: "center" | "left";
  width: number;
}) => (
  <View
    className="justify-center"
    style={{
      borderBottomColor: `${borderColor}${SUBTLE_BORDER_ALPHA}`,
      borderBottomWidth: 1,
      borderRightColor: `${borderColor}${
        rightBorder === "subtle" ? SUBTLE_BORDER_ALPHA : STRONG_BORDER_ALPHA
      }`,
      borderRightWidth: rightBorder ? 1 : 0,
      height: DAY_ROW_HEIGHT,
      paddingLeft: paddingLeft ?? CELL_HORIZONTAL_PADDING,
      paddingRight: CELL_HORIZONTAL_PADDING,
      width,
    }}
  >
    <Text
      className="text-xs"
      color={muted ? "muted" : undefined}
      numberOfLines={1}
      style={{ textAlign }}
    >
      {prefix ? `${prefix} ${label}` : label}
    </Text>
  </View>
);
