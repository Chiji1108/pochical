import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { addDays, startOfDay, startOfMonth } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getItemAsync, setItemAsync } from "expo-secure-store";
import { SymbolView } from "expo-symbols";
import { Button, Text, useThemeColor } from "heroui-native";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GroupDetailView } from "@/components/group/group-detail-view";
import {
  SHARED_SHIFT_DATE_COLUMN_WIDTH,
  SHARED_SHIFT_MEMBER_COLUMN_WIDTH,
  type SharedShiftCellValue,
  type SharedShiftMember,
  type SharedShiftScheduleDay,
  SharedShiftTable,
} from "@/components/group/shared-shift-table";
import { useCurrentUserId } from "@/lib/instant";
import { api as convexApi } from "../../../convex/_generated/api";

const SELECTED_GROUP_STORAGE_KEY = "pochical-selected-group-id";
const MAX_RAIL_UNREAD_COUNT = 99;
const EMPTY_GROUPS_HORIZONTAL_PADDING = 24;
const SAMPLE_PREVIEW_MAX_WIDTH = 360;
const SAMPLE_SHIFT_START_DATE = startOfDay(new Date(2026, 4, 25));
const SAMPLE_SHARED_SHIFT_MEMBERS: SharedShiftMember[] = [
  { _id: "sample-member-tanaka", displayName: "田中", instantUserId: "tanaka" },
  { _id: "sample-member-sato", displayName: "佐藤", instantUserId: "sato" },
  { _id: "sample-member-suzuki", displayName: "鈴木", instantUserId: "suzuki" },
] as const;
const SAMPLE_SHIFT_PATTERNS = {
  early: { countsAsDayOff: false, emoji: "☀️", name: "早番" },
  late: { countsAsDayOff: false, emoji: "🌙", name: "遅番" },
  nightAfter: { countsAsDayOff: true, emoji: "🌅", name: "明け" },
  night: { countsAsDayOff: false, emoji: "🌃", name: "夜勤" },
  off: { countsAsDayOff: true, emoji: "💤", name: "休み" },
  paidLeave: { countsAsDayOff: true, emoji: "🌿", name: "有休" },
} as const;
const SAMPLE_SHARED_SHIFT_DAYS: SharedShiftScheduleDay[] = Array.from(
  { length: 5 },
  (_, index) => {
    const date = addDays(SAMPLE_SHIFT_START_DATE, index);

    return {
      date,
      time: date.getTime(),
    };
  }
);
const SAMPLE_SHARED_SHIFT_ASSIGNMENTS = [
  ["early", "late", "off"],
  ["late", "off", "night"],
  ["off", "paidLeave", "nightAfter"],
  ["night", "early", "late"],
  ["nightAfter", "off", "early"],
] as const;
const SAMPLE_SHARED_SHIFTS_BY_USER_AND_DATE =
  SAMPLE_SHARED_SHIFT_ASSIGNMENTS.reduce((shiftMap, assignments, dayIndex) => {
    for (const [memberIndex, patternKey] of assignments.entries()) {
      const member = SAMPLE_SHARED_SHIFT_MEMBERS[memberIndex];
      const day = SAMPLE_SHARED_SHIFT_DAYS[dayIndex];

      if (!(member && day)) {
        continue;
      }

      shiftMap.set(`${member.instantUserId}:${day.time}`, {
        pattern: SAMPLE_SHIFT_PATTERNS[patternKey],
      });
    }

    return shiftMap;
  }, new Map<string, SharedShiftCellValue>());

type ConvexGroupSummary = FunctionReturnType<
  typeof convexApi.groups.listForCurrentUser
>[number];

export default function Group() {
  const router = useRouter();
  const { groupId: requestedGroupId, showInvite } = useLocalSearchParams<{
    groupId?: string;
    showInvite?: string;
  }>();
  const currentUserId = useCurrentUserId();
  const accentForegroundColor = useThemeColor("accent-foreground");
  const groups = useQuery(
    convexApi.groups.listForCurrentUser,
    currentUserId ? { instantUserId: currentUserId } : "skip"
  );
  const [hasLoadedSelectedGroupId, setHasLoadedSelectedGroupId] =
    useState(false);
  const [
    backgroundColor,
    borderColor,
    borderSecondaryColor,
    dangerColor,
    dangerForegroundColor,
    surfaceSecondaryColor,
  ] = useThemeColor([
    "background",
    "border",
    "border-secondary",
    "danger",
    "danger-foreground",
    "surface-secondary",
  ]);
  const [lastAppliedRequestedGroupId, setLastAppliedRequestedGroupId] =
    useState<string>();
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const hasLoadedGroups = Boolean(currentUserId) && groups !== undefined;
  const hasGroups = Boolean(groups && groups.length > 0);
  const selectedGroup = groups?.find((group) => group._id === selectedGroupId);

  useEffect(() => {
    let isMounted = true;

    getItemAsync(SELECTED_GROUP_STORAGE_KEY)
      .then((storedGroupId) => {
        if (isMounted) {
          setSelectedGroupId(storedGroupId ?? undefined);
        }
      })
      .finally(() => {
        if (isMounted) {
          setHasLoadedSelectedGroupId(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!(hasLoadedSelectedGroupId && groups)) {
      return;
    }

    if (groups.length === 0) {
      setSelectedGroupId(undefined);
      return;
    }

    const requestedGroup = requestedGroupId
      ? groups.find((group) => group._id === requestedGroupId)
      : undefined;

    if (requestedGroup && lastAppliedRequestedGroupId !== requestedGroupId) {
      setLastAppliedRequestedGroupId(requestedGroupId);
      setSelectedGroupId(requestedGroup._id);
      setItemAsync(SELECTED_GROUP_STORAGE_KEY, requestedGroup._id).catch(
        () => undefined
      );
      return;
    }

    const isSelectedGroupAvailable = groups.some(
      (group) => group._id === selectedGroupId
    );

    if (isSelectedGroupAvailable) {
      return;
    }

    const nextGroupId = groups[0]._id;
    setSelectedGroupId(nextGroupId);
    setItemAsync(SELECTED_GROUP_STORAGE_KEY, nextGroupId).catch(
      () => undefined
    );
  }, [
    groups,
    hasLoadedSelectedGroupId,
    lastAppliedRequestedGroupId,
    requestedGroupId,
    selectedGroupId,
  ]);

  const selectGroup = useCallback((groupId: string) => {
    setSelectedGroupId(groupId);
    setItemAsync(SELECTED_GROUP_STORAGE_KEY, groupId).catch(() => undefined);
  }, []);

  const openGroupCreator = useCallback(() => {
    router.push("/share-groups/new");
  }, [router]);

  const openQrScanner = useCallback(() => {
    router.push("/invite/scan");
  }, [router]);

  const clearConsumedInvitePrompt = useCallback(() => {
    if (showInvite !== "1") {
      return;
    }

    if (requestedGroupId) {
      router.replace(`/group?groupId=${encodeURIComponent(requestedGroupId)}`);
      return;
    }

    router.replace("/group");
  }, [requestedGroupId, router, showInvite]);

  const shouldShowInviteForSelectedGroup =
    showInvite === "1" && selectedGroup?._id === requestedGroupId;

  let mainContent = <View style={styles.flex} />;

  if (selectedGroup) {
    mainContent = (
      <GroupDetailView
        groupId={selectedGroup._id}
        isEmbedded={true}
        onAutoInviteShown={clearConsumedInvitePrompt}
        showInvite={shouldShowInviteForSelectedGroup}
      />
    );
  } else if (hasLoadedGroups && !hasGroups) {
    mainContent = (
      <EmptyGroupsView
        accentForegroundColor={accentForegroundColor}
        isCreateDisabled={!currentUserId}
        onCreateGroup={openGroupCreator}
        onScanQr={openQrScanner}
      />
    );
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={[styles.flex, { backgroundColor }]}
    >
      <View style={styles.rootRow}>
        {hasGroups ? (
          <GroupRail
            borderColor={borderColor}
            borderSecondaryColor={borderSecondaryColor}
            dangerColor={dangerColor}
            dangerForegroundColor={dangerForegroundColor}
            groups={groups ?? []}
            isCreateDisabled={!currentUserId}
            onCreateGroup={openGroupCreator}
            onScanQr={openQrScanner}
            onSelectGroup={selectGroup}
            selectedGroupId={selectedGroup?._id}
            surfaceSecondaryColor={surfaceSecondaryColor}
          />
        ) : null}
        <View style={[styles.flex, { backgroundColor }]}>{mainContent}</View>
      </View>
    </SafeAreaView>
  );
}

const GroupRail = ({
  borderColor,
  borderSecondaryColor,
  dangerColor,
  dangerForegroundColor,
  groups,
  isCreateDisabled,
  onCreateGroup,
  onScanQr,
  onSelectGroup,
  selectedGroupId,
  surfaceSecondaryColor,
}: {
  borderColor: string;
  borderSecondaryColor: string;
  dangerColor: string;
  dangerForegroundColor: string;
  groups: ConvexGroupSummary[];
  isCreateDisabled: boolean;
  onCreateGroup: () => void;
  onScanQr: () => void;
  onSelectGroup: (groupId: string) => void;
  selectedGroupId?: string;
  surfaceSecondaryColor: string;
}) => (
  <View style={[styles.rail, { borderColor }]}>
    <View style={styles.railContent}>
      <View style={[styles.railActions, { borderColor }]}>
        <Button
          accessibilityLabel="グループを作成"
          isDisabled={isCreateDisabled}
          isIconOnly={true}
          onPress={onCreateGroup}
          size="sm"
          variant="ghost"
        >
          <SymbolView
            name={{ android: "add", ios: "plus", web: "add" }}
            size={18}
          />
        </Button>
        <Button
          accessibilityLabel="招待QRコードを読み取る"
          isIconOnly={true}
          onPress={onScanQr}
          size="sm"
          variant="ghost"
        >
          <SymbolView
            name={{
              android: "qr_code_scanner",
              ios: "qrcode.viewfinder",
              web: "qr_code_scanner",
            }}
            size={17}
          />
        </Button>
      </View>
      <ScrollView
        contentContainerStyle={styles.railScrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.flex}
      >
        {groups.map((group) => (
          <GroupRailItem
            borderSecondaryColor={borderSecondaryColor}
            dangerColor={dangerColor}
            dangerForegroundColor={dangerForegroundColor}
            group={group}
            isSelected={group._id === selectedGroupId}
            key={group._id}
            onPress={() => {
              onSelectGroup(group._id);
            }}
            surfaceSecondaryColor={surfaceSecondaryColor}
          />
        ))}
      </ScrollView>
    </View>
  </View>
);

const GroupRailItem = ({
  borderSecondaryColor,
  dangerColor,
  dangerForegroundColor,
  group,
  isSelected,
  onPress,
  surfaceSecondaryColor,
}: {
  borderSecondaryColor: string;
  dangerColor: string;
  dangerForegroundColor: string;
  group: ConvexGroupSummary;
  isSelected: boolean;
  onPress: () => void;
  surfaceSecondaryColor: string;
}) => (
  <Pressable
    accessibilityLabel={`${group.name}を選択${
      group.unreadCount > 0 ? `、未読${group.unreadCount}件` : ""
    }`}
    accessibilityRole="button"
    accessibilityState={{ selected: isSelected }}
    onPress={onPress}
    style={styles.railItem}
  >
    <GroupRailIcon
      borderSecondaryColor={borderSecondaryColor}
      dangerColor={dangerColor}
      dangerForegroundColor={dangerForegroundColor}
      emoji={group.emoji}
      isSelected={isSelected}
      surfaceSecondaryColor={surfaceSecondaryColor}
      unreadCount={group.unreadCount}
    />
  </Pressable>
);

const GroupRailIcon = ({
  borderSecondaryColor,
  dangerColor,
  dangerForegroundColor,
  emoji,
  isSelected,
  unreadCount,
  surfaceSecondaryColor,
}: {
  borderSecondaryColor: string;
  dangerColor: string;
  dangerForegroundColor: string;
  emoji: string;
  isSelected: boolean;
  unreadCount: number;
  surfaceSecondaryColor: string;
}) => (
  <View style={styles.railIconFrame}>
    <View
      style={[
        styles.railIcon,
        isSelected ? styles.selectedRailIcon : styles.unselectedRailIcon,
        {
          backgroundColor: isSelected ? surfaceSecondaryColor : "transparent",
          borderColor: isSelected ? borderSecondaryColor : "transparent",
        },
      ]}
    >
      <Text style={styles.railEmoji}>{emoji}</Text>
    </View>
    {unreadCount > 0 ? (
      <RailUnreadBadge
        color={dangerColor}
        count={unreadCount}
        foregroundColor={dangerForegroundColor}
      />
    ) : null}
  </View>
);

const RailUnreadBadge = ({
  color,
  count,
  foregroundColor,
}: {
  color: string;
  count: number;
  foregroundColor: string;
}) => (
  <View style={[styles.railUnreadBadge, { backgroundColor: color }]}>
    <Text style={[styles.railUnreadText, { color: foregroundColor }]}>
      {count > MAX_RAIL_UNREAD_COUNT ? `${MAX_RAIL_UNREAD_COUNT}+` : count}
    </Text>
  </View>
);

const EmptyGroupsView = ({
  accentForegroundColor,
  isCreateDisabled,
  onCreateGroup,
  onScanQr,
}: {
  accentForegroundColor: string;
  isCreateDisabled: boolean;
  onCreateGroup: () => void;
  onScanQr: () => void;
}) => {
  const [borderColor, highlightBackgroundColor, todayColor] = useThemeColor([
    "border",
    "success",
    "accent",
  ]);

  return (
    <ScrollView
      contentContainerStyle={styles.emptyGroups}
      showsVerticalScrollIndicator={false}
      style={styles.flex}
    >
      <View style={styles.emptyTextGroup}>
        <Text style={styles.emptyTitle}>グループでシフトを共有できます</Text>
      </View>
      <SampleShiftPreview
        borderColor={borderColor}
        highlightBackgroundColor={highlightBackgroundColor}
        todayColor={todayColor}
      />
      <View style={styles.emptyActionArea}>
        <Button
          accessibilityLabel="グループを作成"
          isDisabled={isCreateDisabled}
          onPress={onCreateGroup}
          size="sm"
          variant="primary"
        >
          <SymbolView
            name={{ android: "add", ios: "plus", web: "add" }}
            size={18}
            tintColor={accentForegroundColor}
          />
          <Button.Label>グループを作成</Button.Label>
        </Button>
        <Button
          accessibilityLabel="招待QRコードを読み取る"
          onPress={onScanQr}
          size="sm"
          variant="outline"
        >
          <SymbolView
            name={{
              android: "qr_code_scanner",
              ios: "qrcode.viewfinder",
              web: "qr_code_scanner",
            }}
            size={17}
          />
          <Button.Label>QRコードで参加</Button.Label>
        </Button>
      </View>
    </ScrollView>
  );
};

const SampleShiftPreview = ({
  borderColor,
  highlightBackgroundColor,
  todayColor,
}: {
  borderColor: string;
  highlightBackgroundColor: string;
  todayColor: string;
}) => {
  const { width: screenWidth } = useWindowDimensions();
  const previewWidth = Math.max(
    SHARED_SHIFT_DATE_COLUMN_WIDTH +
      SAMPLE_SHARED_SHIFT_MEMBERS.length * SHARED_SHIFT_MEMBER_COLUMN_WIDTH,
    Math.min(
      SAMPLE_PREVIEW_MAX_WIDTH,
      screenWidth - EMPTY_GROUPS_HORIZONTAL_PADDING * 2
    )
  );
  const memberColumnWidth =
    (previewWidth - SHARED_SHIFT_DATE_COLUMN_WIDTH) /
    SAMPLE_SHARED_SHIFT_MEMBERS.length;

  return (
    <View
      accessibilityLabel="サンプルの共有シフト表"
      style={[styles.samplePreview, { width: previewWidth }]}
    >
      <View style={styles.sampleTableFrame}>
        <SharedShiftTable
          centerContent={true}
          colors={{
            border: borderColor,
            highlightBackground: highlightBackgroundColor,
            today: todayColor,
          }}
          memberColumnWidth={memberColumnWidth}
          members={SAMPLE_SHARED_SHIFT_MEMBERS}
          scheduleDays={SAMPLE_SHARED_SHIFT_DAYS}
          scrollEnabled={false}
          shiftsByUserAndDate={SAMPLE_SHARED_SHIFTS_BY_USER_AND_DATE}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          tableWidth={previewWidth}
          useVirtualizedRows={false}
          visibleMonth={startOfMonth(SAMPLE_SHIFT_START_DATE)}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  emptyActionArea: {
    gap: 8,
    marginTop: 36,
    maxWidth: 288,
    width: "100%",
  },
  emptyGroups: {
    alignItems: "center",
    flexGrow: 1,
    gap: 18,
    justifyContent: "center",
    paddingBottom: 32,
    paddingHorizontal: EMPTY_GROUPS_HORIZONTAL_PADDING,
    paddingTop: 32,
  },
  emptyTextGroup: {
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  flex: {
    flex: 1,
  },
  rail: {
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    width: 68,
  },
  railActions: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 8,
  },
  railContent: {
    alignItems: "center",
    flex: 1,
    overflow: "hidden",
    paddingVertical: 8,
  },
  railEmoji: {
    fontSize: 24,
  },
  railIcon: {
    alignItems: "center",
    borderWidth: 2,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  railIconFrame: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    position: "relative",
    width: 48,
  },
  railItem: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 60,
  },
  railScrollContent: {
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
  },
  railUnreadBadge: {
    alignItems: "center",
    borderRadius: 999,
    height: 18,
    justifyContent: "center",
    minWidth: 20,
    paddingHorizontal: 4,
    position: "absolute",
    right: -4,
    top: -4,
  },
  railUnreadText: {
    fontSize: 10,
    fontWeight: "600",
    includeFontPadding: false,
    lineHeight: 12,
    textAlign: "center",
  },
  rootRow: {
    flex: 1,
    flexDirection: "row",
  },
  samplePreview: {
    alignItems: "stretch",
    maxWidth: SAMPLE_PREVIEW_MAX_WIDTH,
  },
  sampleTableFrame: {
    overflow: "hidden",
    width: "100%",
  },
  selectedRailIcon: {
    borderRadius: 12,
    opacity: 0.95,
  },
  unselectedRailIcon: {
    borderRadius: 16,
  },
});
