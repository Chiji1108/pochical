import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Button, ListGroup, Text, useThemeColor } from "heroui-native";
import { useSession } from "jazz-tools/react-native";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import { GroupFormDialog } from "@/components/group/group-dialogs";
import { api as convexApi } from "../../../convex/_generated/api";

const StyledSafeAreaView = withUniwind(SafeAreaView);
const MAX_MEMBER_SUMMARY_NAMES = 3;

type ConvexGroupSummary = FunctionReturnType<
  typeof convexApi.groups.listForCurrentUser
>[number];

const getMemberSummary = (group: ConvexGroupSummary) => {
  if (group.members.length === 0) {
    return "メンバーなし";
  }

  const visibleMembers = group.members.slice(0, MAX_MEMBER_SUMMARY_NAMES);
  const hiddenMemberCount = group.members.length - visibleMembers.length;
  const memberNames = visibleMembers
    .map((member) => member.displayName)
    .join("、");

  return hiddenMemberCount > 0
    ? `${memberNames} 他${hiddenMemberCount}人`
    : memberNames;
};

export default function Group() {
  const router = useRouter();
  const session = useSession();
  const accentForegroundColor = useThemeColor("accent-foreground");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const currentUserId = session?.user_id ?? "";
  const groups = useQuery(
    convexApi.groups.listForCurrentUser,
    currentUserId ? { jazzUserId: currentUserId } : "skip"
  );
  const createGroupMutation = useMutation(convexApi.groups.create);
  const hasLoadedGroups = Boolean(session) && groups !== undefined;

  const createGroup = async (groupName: string, displayName: string) => {
    if (!session) {
      return;
    }

    try {
      const result = await createGroupMutation({
        displayName,
        jazzUserId: session.user_id,
        name: groupName,
      });
      setIsCreateDialogOpen(false);
      router.push(`/share-groups/${result.groupId}?showInvite=1`);
    } catch (error) {
      Alert.alert(
        "作成できませんでした",
        error instanceof Error
          ? error.message
          : "時間をおいて再試行してください"
      );
    }
  };

  let groupContent = <View className="flex-1" />;

  if (groups && groups.length > 0) {
    groupContent = (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          gap: 12,
          paddingBottom: 16,
          paddingHorizontal: 16,
          paddingTop: 8,
        }}
        showsVerticalScrollIndicator={false}
      >
        {groups.map((group) => (
          <GroupListItem
            group={group}
            key={group._id}
            onOpen={() => {
              router.push(`/share-groups/${group._id}`);
            }}
          />
        ))}
      </ScrollView>
    );
  } else if (hasLoadedGroups) {
    groupContent = (
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Text className="text-center text-base" color="muted">
          グループがありません
        </Text>
        <Button
          accessibilityLabel="グループを作成"
          isDisabled={!session}
          onPress={() => {
            setIsCreateDialogOpen(true);
          }}
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
      </View>
    );
  }

  return (
    <StyledSafeAreaView
      className="flex-1 bg-background"
      edges={["top", "left", "right", "bottom"]}
    >
      <View className="flex-1">
        <View className="h-14 flex-row items-center justify-between px-4">
          <Text className="font-bold text-xl">グループ</Text>
          <View className="flex-row items-center gap-1">
            <Button
              accessibilityLabel="招待QRコードを読み取る"
              isIconOnly={true}
              onPress={() => {
                router.push("/invite/scan");
              }}
              size="sm"
              variant="ghost"
            >
              <SymbolView
                name={{
                  android: "qr_code_scanner",
                  ios: "qrcode.viewfinder",
                  web: "qr_code_scanner",
                }}
                size={16}
              />
            </Button>
            <Button
              accessibilityLabel="グループを作成"
              isDisabled={!session}
              isIconOnly={true}
              onPress={() => {
                setIsCreateDialogOpen(true);
              }}
              size="sm"
              variant="ghost"
            >
              <SymbolView
                name={{ android: "add", ios: "plus", web: "add" }}
                size={16}
              />
            </Button>
          </View>
        </View>
        {groupContent}
      </View>
      <GroupFormDialog
        isOpen={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={createGroup}
        submitLabel="保存"
        title="グループを作成"
      />
    </StyledSafeAreaView>
  );
}

const GroupListItem = ({
  group,
  onOpen,
}: {
  group: ConvexGroupSummary;
  onOpen: () => void;
}) => (
  <ListGroup>
    <ListGroup.Item
      accessibilityLabel={`${group.name}の詳細を開く`}
      onPress={onOpen}
    >
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle numberOfLines={1}>
          {group.name}
        </ListGroup.ItemTitle>
        <ListGroup.ItemDescription numberOfLines={1}>
          {getMemberSummary(group)}
        </ListGroup.ItemDescription>
      </ListGroup.ItemContent>
      <GroupItemSuffix unreadCount={group.unreadCount} />
    </ListGroup.Item>
  </ListGroup>
);

const GroupItemSuffix = ({ unreadCount }: { unreadCount: number }) => {
  if (unreadCount <= 0) {
    return <ListGroup.ItemSuffix />;
  }

  return (
    <ListGroup.ItemSuffix>
      <View className="flex-row items-center gap-2">
        <UnreadBadge count={unreadCount} />
        <ListGroup.ItemSuffix />
      </View>
    </ListGroup.ItemSuffix>
  );
};

const UnreadBadge = ({ count }: { count: number }) => (
  <View className="min-w-5 items-center rounded-full bg-danger px-1.5 py-0.5">
    <Text className="font-semibold text-[11px] text-danger-foreground">
      {count > 99 ? "99+" : count}
    </Text>
  </View>
);
