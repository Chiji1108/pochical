import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getItemAsync, setItemAsync } from "expo-secure-store";
import { SymbolView } from "expo-symbols";
import { Button, Text, useThemeColor } from "heroui-native";
import { useSession } from "jazz-tools/react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import { GroupDetailView } from "@/components/group/group-detail-view";
import { api as convexApi } from "../../../convex/_generated/api";

const StyledSafeAreaView = withUniwind(SafeAreaView);
const SELECTED_GROUP_STORAGE_KEY = "nurse-shift-selected-group-id";
const MAX_RAIL_UNREAD_COUNT = 99;

type ConvexGroupSummary = FunctionReturnType<
  typeof convexApi.groups.listForCurrentUser
>[number];

export default function Group() {
  const router = useRouter();
  const { groupId: requestedGroupId, showInvite } = useLocalSearchParams<{
    groupId?: string;
    showInvite?: string;
  }>();
  const session = useSession();
  const currentUserId = session?.user_id ?? "";
  const accentForegroundColor = useThemeColor("accent-foreground");
  const groups = useQuery(
    convexApi.groups.listForCurrentUser,
    currentUserId ? { jazzUserId: currentUserId } : "skip"
  );
  const [hasLoadedSelectedGroupId, setHasLoadedSelectedGroupId] =
    useState(false);
  const [lastAppliedRequestedGroupId, setLastAppliedRequestedGroupId] =
    useState<string>();
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const hasLoadedGroups = Boolean(session) && groups !== undefined;
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

  let mainContent = <View className="flex-1" />;

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
        isCreateDisabled={!session}
        onCreateGroup={openGroupCreator}
        onScanQr={openQrScanner}
      />
    );
  }

  return (
    <StyledSafeAreaView
      className="flex-1 bg-background"
      edges={["top", "left", "right", "bottom"]}
    >
      <View className="flex-1 flex-row">
        {hasGroups ? (
          <GroupRail
            groups={groups ?? []}
            isCreateDisabled={!session}
            onCreateGroup={openGroupCreator}
            onScanQr={openQrScanner}
            onSelectGroup={selectGroup}
            selectedGroupId={selectedGroup?._id}
          />
        ) : null}
        <View className="flex-1 bg-background">{mainContent}</View>
      </View>
    </StyledSafeAreaView>
  );
}

const GroupRail = ({
  groups,
  isCreateDisabled,
  onCreateGroup,
  onScanQr,
  onSelectGroup,
  selectedGroupId,
}: {
  groups: ConvexGroupSummary[];
  isCreateDisabled: boolean;
  onCreateGroup: () => void;
  onScanQr: () => void;
  onSelectGroup: (groupId: string) => void;
  selectedGroupId?: string;
}) => (
  <View className="w-[68px] border-border border-r bg-background py-2">
    <View className="flex-1 items-center overflow-hidden py-2">
      <View className="items-center gap-2 border-border border-b px-2 pb-2">
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
        className="flex-1"
        contentContainerStyle={{
          alignItems: "center",
          gap: 10,
          paddingTop: 10,
        }}
        showsVerticalScrollIndicator={false}
      >
        {groups.map((group) => (
          <GroupRailItem
            group={group}
            isSelected={group._id === selectedGroupId}
            key={group._id}
            onPress={() => {
              onSelectGroup(group._id);
            }}
          />
        ))}
      </ScrollView>
    </View>
  </View>
);

const GroupRailItem = ({
  group,
  isSelected,
  onPress,
}: {
  group: ConvexGroupSummary;
  isSelected: boolean;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityLabel={`${group.name}を選択${
      group.unreadCount > 0 ? `、未読${group.unreadCount}件` : ""
    }`}
    accessibilityRole="button"
    accessibilityState={{ selected: isSelected }}
    className="h-12 w-[60px] items-center justify-center"
    onPress={onPress}
  >
    <GroupRailIcon
      emoji={group.emoji}
      isSelected={isSelected}
      unreadCount={group.unreadCount}
    />
  </Pressable>
);

const GroupRailIcon = ({
  emoji,
  isSelected,
  unreadCount,
}: {
  emoji: string;
  isSelected: boolean;
  unreadCount: number;
}) => (
  <View className="relative h-12 w-12 items-center justify-center">
    <View
      className={`h-12 w-12 items-center justify-center border-2 ${
        isSelected
          ? "rounded-xl border-foreground/10 bg-foreground/5"
          : "rounded-2xl border-transparent bg-content2"
      }`}
    >
      <Text className="text-2xl">{emoji}</Text>
    </View>
    {unreadCount > 0 ? <RailUnreadBadge count={unreadCount} /> : null}
  </View>
);

const RailUnreadBadge = ({ count }: { count: number }) => (
  <View className="absolute -top-1 -right-1 min-w-5 items-center rounded-full bg-danger px-1">
    <Text className="font-semibold text-[10px] text-danger-foreground">
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
}) => (
  <View className="flex-1 items-center justify-center gap-4 px-6">
    <View className="items-center gap-2">
      <Text className="font-semibold text-xl">グループがありません</Text>
      <Text className="text-center text-sm" color="muted">
        グループを作成するか、招待QRコードから参加できます
      </Text>
    </View>
    <View className="w-full max-w-72 gap-2">
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
  </View>
);
