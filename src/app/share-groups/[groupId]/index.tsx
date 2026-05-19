import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Button, Card, ListGroup, Text, useThemeColor } from "heroui-native";
import { useSession } from "jazz-tools/react-native";
import { useRef, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import {
  DisplayNameFormDialog,
  GroupFormDialog,
  type InviteDetails,
  InviteDialog,
} from "@/components/group/group-dialogs";
import { AppHeader } from "@/components/navigation/app-header";
import { api as convexApi } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type GroupDetail = NonNullable<
  FunctionReturnType<typeof convexApi.groups.getDetail>
>;

type GroupMember = GroupDetail["members"][number];

export default function ShareGroupDetail() {
  const router = useRouter();
  const session = useSession();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const currentUserId = session?.user_id ?? "";
  const group = useQuery(
    convexApi.groups.getDetail,
    groupId && currentUserId
      ? { groupId: groupId as Id<"groups">, jazzUserId: currentUserId }
      : "skip"
  );
  const updateGroupName = useMutation(convexApi.groups.updateName);
  const updateDisplayName = useMutation(convexApi.groups.updateDisplayName);
  const leaveGroupMutation = useMutation(convexApi.groups.leave);
  const isLeavingGroupRef = useRef(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDisplayNameDialogOpen, setIsDisplayNameDialogOpen] = useState(false);
  const [inviteDetails, setInviteDetails] = useState<InviteDetails>();
  const [isLeaving, setIsLeaving] = useState(false);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/group");
  };

  const openGroupShift = () => {
    if (!group) {
      return;
    }

    router.push(`/share-groups/${group._id}/shifts`);
  };

  const showChatPlaceholder = (title: string) => {
    Alert.alert(title, "チャット画面はまだ準備中です。");
  };

  const openInvite = () => {
    if (!group) {
      return;
    }

    setInviteDetails({ groupName: group.name, url: group.inviteUrl });
  };

  const updateGroup = async (groupName: string) => {
    if (!(group && session)) {
      return;
    }

    const targetGroupId = group._id;

    try {
      await updateGroupName({
        groupId: targetGroupId,
        jazzUserId: session.user_id,
        name: groupName,
      });
      setIsEditDialogOpen(false);
    } catch (error) {
      Alert.alert(
        "保存できませんでした",
        error instanceof Error
          ? error.message
          : "時間をおいて再試行してください"
      );
    }
  };

  const updateOwnDisplayName = async (displayName: string) => {
    if (!(group && session)) {
      return;
    }

    try {
      await updateDisplayName({
        displayName,
        groupId: group._id,
        jazzUserId: session.user_id,
      });
      setIsDisplayNameDialogOpen(false);
    } catch (error) {
      Alert.alert(
        "保存できませんでした",
        error instanceof Error
          ? error.message
          : "時間をおいて再試行してください"
      );
    }
  };

  const leaveGroup = () => {
    if (!(group && session) || isLeavingGroupRef.current) {
      return;
    }

    const isLastMember = group.members.length === 1;
    const title = isLastMember
      ? `${group.name}を削除しますか？`
      : `${group.name}から脱退しますか？`;
    const message = isLastMember
      ? "最後のメンバーのため、グループも削除されます。"
      : "このグループのメンバーには、あなたのシフトが共有されなくなります。";
    const targetGroupId = group._id;
    const jazzUserId = session.user_id;
    const clearLeaveLock = () => {
      isLeavingGroupRef.current = false;
      setIsLeaving(false);
    };

    isLeavingGroupRef.current = true;
    setIsLeaving(true);

    Alert.alert(
      title,
      message,
      [
        { onPress: clearLeaveLock, style: "cancel", text: "キャンセル" },
        {
          onPress: async () => {
            try {
              await leaveGroupMutation({ groupId: targetGroupId, jazzUserId });
              setIsEditDialogOpen(false);
              router.replace("/group");
            } catch (error) {
              Alert.alert(
                "脱退できませんでした",
                error instanceof Error
                  ? error.message
                  : "時間をおいて再試行してください"
              );
            } finally {
              clearLeaveLock();
            }
          },
          style: "destructive",
          text: isLastMember ? "削除" : "脱退",
        },
      ],
      {
        cancelable: false,
      }
    );
  };

  if (group === undefined) {
    return <View className="flex-1 bg-background" />;
  }

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
            onPress: goBack,
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
          onPress: goBack,
        }}
        rightActions={[
          {
            accessibilityLabel: `${group.name}を編集`,
            icon: { android: "edit", ios: "pencil", web: "edit" },
            onPress: () => {
              setIsEditDialogOpen(true);
            },
          },
        ]}
        title={group.name}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          gap: 16,
          paddingBottom: 24,
          paddingHorizontal: 16,
          paddingTop: 16,
        }}
      >
        <GroupActionSection
          group={group}
          onOpenChat={() => {
            showChatPlaceholder("全体チャット");
          }}
          onOpenShift={openGroupShift}
        />
        <MemberSection
          currentUserId={currentUserId}
          members={group.members}
          onInvite={openInvite}
          onOpenMemberChat={(member) => {
            showChatPlaceholder(`${member.displayName}さんとのチャット`);
          }}
          onOpenOwnDisplayNameEdit={() => {
            setIsDisplayNameDialogOpen(true);
          }}
        />
      </ScrollView>
      <GroupFormDialog
        group={group}
        initialGroupName={group.name}
        isDisplayNameVisible={false}
        isLeaving={isLeaving}
        isOpen={isEditDialogOpen}
        onLeave={leaveGroup}
        onOpenChange={setIsEditDialogOpen}
        onSubmit={updateGroup}
        submitLabel="保存"
        title="グループを編集"
      />
      <DisplayNameFormDialog
        initialDisplayName={group.ownDisplayName}
        isOpen={isDisplayNameDialogOpen}
        onOpenChange={setIsDisplayNameDialogOpen}
        onSubmit={updateOwnDisplayName}
      />
      <InviteDialog
        inviteDetails={inviteDetails}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setInviteDetails(undefined);
          }
        }}
      />
    </View>
  );
}

const GroupActionSection = ({
  group,
  onOpenChat,
  onOpenShift,
}: {
  group: GroupDetail;
  onOpenChat: () => void;
  onOpenShift: () => void;
}) => {
  const accentForegroundColor = useThemeColor("accent-foreground");

  return (
    <View className="flex-row gap-2">
      <Button
        accessibilityLabel={`${group.name}のシフト表を開く`}
        className="flex-1"
        onPress={onOpenShift}
        size="sm"
        variant="primary"
      >
        <SymbolView
          name={{
            android: "calendar_month",
            ios: "calendar",
            web: "calendar_month",
          }}
          size={16}
          tintColor={accentForegroundColor}
        />
        <Button.Label>シフト表</Button.Label>
      </Button>
      <Button
        accessibilityLabel={`${group.name}の全体チャットを開く`}
        className="flex-1"
        onPress={onOpenChat}
        size="sm"
        variant="outline"
      >
        <SymbolView
          name={{
            android: "chat_bubble",
            ios: "message",
            web: "chat_bubble",
          }}
          size={16}
        />
        <Button.Label>全体チャット</Button.Label>
      </Button>
    </View>
  );
};

const MemberSection = ({
  currentUserId,
  members,
  onInvite,
  onOpenMemberChat,
  onOpenOwnDisplayNameEdit,
}: {
  currentUserId: string;
  members: GroupMember[];
  onInvite: () => void;
  onOpenMemberChat: (member: GroupMember) => void;
  onOpenOwnDisplayNameEdit: () => void;
}) => {
  const ownMember = members.find(
    (member) => member.jazzUserId === currentUserId
  );
  const otherMembers = members.filter(
    (member) => member.jazzUserId !== currentUserId
  );
  const orderedMembers = ownMember ? [ownMember, ...otherMembers] : members;

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 font-semibold text-lg">
          メンバー ({members.length}人)
        </Text>
        <Button
          accessibilityLabel="メンバーを招待"
          onPress={onInvite}
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
          <Button.Label>招待</Button.Label>
        </Button>
      </View>
      <View className="gap-2">
        {orderedMembers.length > 0 ? (
          orderedMembers.map((member) => {
            const isOwnMember = member.jazzUserId === currentUserId;

            return (
              <MemberListItem
                isOwnMember={isOwnMember}
                key={member._id}
                member={member}
                onOpenChat={() => {
                  onOpenMemberChat(member);
                }}
                onOpenOwnDisplayNameEdit={onOpenOwnDisplayNameEdit}
              />
            );
          })
        ) : (
          <Card className="p-4">
            <Text className="text-sm" color="muted">
              メンバーがいません
            </Text>
          </Card>
        )}
      </View>
    </View>
  );
};

const MemberListItem = ({
  isOwnMember,
  member,
  onOpenChat,
  onOpenOwnDisplayNameEdit,
}: {
  isOwnMember: boolean;
  member: GroupMember;
  onOpenChat: () => void;
  onOpenOwnDisplayNameEdit: () => void;
}) => (
  <ListGroup>
    <ListGroup.Item
      accessibilityLabel={
        isOwnMember
          ? `${member.displayName}さん（あなた）`
          : `${member.displayName}さんとのチャットを開く`
      }
      onPress={isOwnMember ? undefined : onOpenChat}
    >
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle numberOfLines={1}>
          {member.displayName}
        </ListGroup.ItemTitle>
        {isOwnMember ? (
          <ListGroup.ItemDescription numberOfLines={1}>
            あなた
          </ListGroup.ItemDescription>
        ) : null}
      </ListGroup.ItemContent>
      {isOwnMember ? (
        <ListGroup.ItemSuffix>
          <Button
            accessibilityLabel="あなたの名前を編集"
            isIconOnly={true}
            onPress={onOpenOwnDisplayNameEdit}
            size="sm"
            variant="ghost"
          >
            <SymbolView
              name={{ android: "edit", ios: "pencil", web: "edit" }}
              size={16}
            />
          </Button>
        </ListGroup.ItemSuffix>
      ) : (
        <ListGroup.ItemSuffix />
      )}
    </ListGroup.Item>
  </ListGroup>
);
