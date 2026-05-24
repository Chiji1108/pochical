import type { FlashListRef } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import {
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, useThemeColor } from "heroui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import useUnmount from "react-use/lib/useUnmount";
import {
  SHARED_SHIFT_DATE_COLUMN_WIDTH,
  SHARED_SHIFT_MEMBER_COLUMN_WIDTH,
  type SharedShiftCellValue,
  type SharedShiftScheduleDay,
  SharedShiftTable,
} from "@/components/group/shared-shift-table";
import { AppHeader } from "@/components/navigation/app-header";
import { db, type Pattern, type Shift, useCurrentUserId } from "@/lib/instant";
import { api as convexApi } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const INITIAL_MONTH_RADIUS = 12;
const RANGE_CHUNK_MONTHS = 6;
const TODAY_ROW_VIEW_POSITION = 0.35;

type MemberScheduleData = {
  patterns: Pattern[];
  shifts: Shift[];
};

const areStringArraysEqual = (first: string[], second: string[]) => {
  if (first.length !== second.length) {
    return false;
  }

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) {
      return false;
    }
  }

  return true;
};

const arePatternsEqual = (first: Pattern[], second: Pattern[]) => {
  if (first.length !== second.length) {
    return false;
  }

  for (let index = 0; index < first.length; index += 1) {
    const firstPattern = first[index];
    const secondPattern = second[index];

    if (
      firstPattern.countsAsDayOff !== secondPattern.countsAsDayOff ||
      firstPattern.emoji !== secondPattern.emoji ||
      firstPattern.id !== secondPattern.id ||
      firstPattern.name !== secondPattern.name
    ) {
      return false;
    }
  }

  return true;
};

const areShiftsEqual = (first: Shift[], second: Shift[]) => {
  if (first.length !== second.length) {
    return false;
  }

  for (let index = 0; index < first.length; index += 1) {
    const firstShift = first[index];
    const secondShift = second[index];

    const firstMemberIds = (firstShift.shiftMembers ?? [])
      .map((member) => member.id)
      .sort();
    const secondMemberIds = (secondShift.shiftMembers ?? [])
      .map((member) => member.id)
      .sort();

    if (
      firstShift.owner?.id !== secondShift.owner?.id ||
      firstShift.id !== secondShift.id ||
      firstShift.pattern?.id !== secondShift.pattern?.id ||
      firstShift.startDate.getTime() !== secondShift.startDate.getTime() ||
      !areStringArraysEqual(firstMemberIds, secondMemberIds)
    ) {
      return false;
    }
  }

  return true;
};

const areMemberScheduleDataEqual = (
  first: MemberScheduleData,
  second: MemberScheduleData
) =>
  arePatternsEqual(first.patterns, second.patterns) &&
  areShiftsEqual(first.shifts, second.shifts);

export default function ShareGroupShifts() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(today));
  const [dateRange, setDateRange] = useState(() => ({
    end: addMonths(today, INITIAL_MONTH_RADIUS),
    start: subMonths(today, INITIAL_MONTH_RADIUS),
  }));
  const scheduleListRef = useRef<FlashListRef<SharedShiftScheduleDay>>(null);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 40,
  }).current;
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const currentUserId = useCurrentUserId();
  const group = useQuery(
    convexApi.groups.getDetail,
    groupId && currentUserId
      ? { groupId: groupId as Id<"groups">, instantUserId: currentUserId }
      : "skip"
  );
  const [highlightBackground, todayColor, borderColor] = useThemeColor([
    "success",
    "accent",
    "border",
  ]);
  const members = group?.members ?? [];
  const [memberScheduleData, setMemberScheduleData] = useState<
    Record<string, MemberScheduleData>
  >({});
  const updateMemberScheduleData = useCallback(
    (memberUserId: string, scheduleData?: MemberScheduleData) => {
      setMemberScheduleData((currentScheduleData) => {
        const currentMemberScheduleData = currentScheduleData[memberUserId];

        if (
          scheduleData &&
          currentMemberScheduleData &&
          areMemberScheduleDataEqual(currentMemberScheduleData, scheduleData)
        ) {
          return currentScheduleData;
        }

        if (!(scheduleData || currentMemberScheduleData)) {
          return currentScheduleData;
        }

        const nextScheduleData = { ...currentScheduleData };

        if (scheduleData) {
          nextScheduleData[memberUserId] = scheduleData;
        } else {
          delete nextScheduleData[memberUserId];
        }

        return nextScheduleData;
      });
    },
    []
  );
  const shiftsByUserAndDate = useMemo(() => {
    const nextShiftsByUserAndDate = new Map<string, SharedShiftCellValue>();

    for (const scheduleData of Object.values(memberScheduleData)) {
      for (const shift of scheduleData.shifts) {
        const ownerId = shift.owner?.id;

        if (!ownerId) {
          continue;
        }

        const key = `${ownerId}:${startOfDay(shift.startDate).getTime()}`;
        nextShiftsByUserAndDate.set(key, { pattern: shift.pattern });
      }
    }

    return nextShiftsByUserAndDate;
  }, [memberScheduleData]);
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
          SHARED_SHIFT_MEMBER_COLUMN_WIDTH,
          (screenWidth - SHARED_SHIFT_DATE_COLUMN_WIDTH) / members.length
        )
      : SHARED_SHIFT_MEMBER_COLUMN_WIDTH;
  const tableWidth =
    SHARED_SHIFT_DATE_COLUMN_WIDTH + members.length * memberColumnWidth;
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(groupId ? `/group?groupId=${groupId}` : "/group");
  }, [groupId, router]);

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
    ({
      viewableItems,
    }: {
      viewableItems: { item?: SharedShiftScheduleDay }[];
    }) => {
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

  const scrollToToday = useCallback(async () => {
    await scrollToTodayIndex(true);
  }, [scrollToTodayIndex]);

  if (group === undefined) {
    return <View className="flex-1 bg-background" />;
  }

  if (!group) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader
          leftAction={{
            accessibilityLabel: "グループ詳細に戻る",
            icon: {
              android: "arrow_back",
              ios: "chevron.left",
              web: "arrow_back",
            },
            label: "戻る",
            onPress: goBack,
          }}
          title="シフト表"
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
          accessibilityLabel: "グループ詳細に戻る",
          icon: {
            android: "arrow_back",
            ios: "chevron.left",
            web: "arrow_back",
          },
          label: "戻る",
          onPress: goBack,
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
            {members.map((member) => (
              <MemberScheduleSubscription
                dateRange={dateRange}
                key={member._id}
                memberUserId={member.instantUserId}
                onChange={updateMemberScheduleData}
              />
            ))}
            <SharedShiftTable
              colors={{
                border: borderColor,
                highlightBackground,
                today: todayColor,
              }}
              initialScrollIndex={initialScrollIndex}
              listRef={scheduleListRef}
              memberColumnWidth={memberColumnWidth}
              members={members}
              onEndReached={appendDays}
              onStartReached={prependDays}
              onViewableItemsChanged={updateVisibleMonth}
              scheduleDays={scheduleDays}
              shiftsByUserAndDate={shiftsByUserAndDate}
              tableWidth={tableWidth}
              today={today}
              viewabilityConfig={viewabilityConfig}
              visibleMonth={visibleMonth}
            />
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

const MemberScheduleSubscription = ({
  dateRange,
  memberUserId,
  onChange,
}: {
  dateRange: { end: Date; start: Date };
  memberUserId: string;
  onChange: (memberUserId: string, scheduleData?: MemberScheduleData) => void;
}) => {
  const { data } = db.useQuery(
    memberUserId
      ? {
          shiftPatterns: {
            $: { where: { "owner.id": memberUserId } },
            owner: {},
          },
          shifts: {
            $: {
              where: {
                "owner.id": memberUserId,
                startDate: {
                  $gte: dateRange.start,
                  $lte: dateRange.end,
                },
              },
            },
            owner: {},
            pattern: {},
            shiftMembers: {},
          },
        }
      : null
  );
  const patterns = (data?.shiftPatterns ?? []) as Pattern[];
  const shifts = (data?.shifts ?? []) as Shift[];

  useEffect(() => {
    onChange(memberUserId, { patterns, shifts });
  }, [memberUserId, onChange, patterns, shifts]);

  useUnmount(() => {
    onChange(memberUserId);
  });

  return null;
};
