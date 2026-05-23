import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import {
  Button,
  Card,
  ListGroup,
  Separator,
  Switch,
  Text,
  useThemeColor,
  useToast,
} from "heroui-native";
import { useRef, useState } from "react";
import { Alert, Platform, ScrollView, View } from "react-native";
import { EmojiPopup } from "react-native-emoji-popup";
import { EmojiPopupCloseButton } from "@/components/common/emoji-popup-close-button";
import {
  DisplayNameFormDialog,
  GroupFormDialog,
  type InviteDetails,
  InviteDialog,
} from "@/components/group/group-dialogs";
import { AppHeader } from "@/components/navigation/app-header";
import { useCurrentUserId } from "@/lib/instant";
import { api as convexApi } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type GroupDetail = NonNullable<
  FunctionReturnType<typeof convexApi.groups.getDetail>
>;

type GroupMember = GroupDetail["members"][number];

export default function ShareGroupSettings() {
  const router = useRouter();
  const accentForegroundColor = useThemeColor("accent-foreground");
  const { toast } = useToast();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const currentUserId = useCurrentUserId();
  const group = useQuery(
    convexApi.groups.getDetail,
    groupId && currentUserId
      ? { groupId: groupId as Id<"groups">, instantUserId: currentUserId }
      : "skip"
  );
  const updateGroupName = useMutation(convexApi.groups.updateName);
  const updateGroupEmoji = useMutation(convexApi.groups.updateEmoji);
  const updateDisplayName = useMutation(convexApi.groups.updateDisplayName);
  const regenerateInviteCode = useMutation(
    convexApi.groups.regenerateInviteCode
  );
  const leaveGroupMutation = useMutation(convexApi.groups.leave);
  const removeMemberMutation = useMutation(convexApi.groups.removeMember);
  const isLeavingGroupRef = useRef(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDisplayNameDialogOpen, setIsDisplayNameDialogOpen] = useState(false);
  const [inviteDetails, setInviteDetails] = useState<InviteDetails>();
  const [isLeaving, setIsLeaving] = useState(false);
  const [isRegeneratingInvite, setIsRegeneratingInvite] = useState(false);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(groupId ? `/group?groupId=${groupId}` : "/group");
  };

  const openInvite = () => {
    if (!group) {
      return;
    }

    setInviteDetails({
      groupEmoji: group.emoji,
      groupName: group.name,
      url: group.inviteUrl,
    });
  };

  const updateGroup = async (groupName: string) => {
    if (!(group && currentUserId)) {
      return;
    }

    const targetGroupId = group._id;

    try {
      await updateGroupName({
        groupId: targetGroupId,
        instantUserId: currentUserId,
        name: groupName,
      });
      setIsEditDialogOpen(false);
      toast.show({
        description: "グループ名を更新しました。",
        label: "保存しました",
        variant: "success",
      });
    } catch (error) {
      Alert.alert(
        "保存できませんでした",
        error instanceof Error
          ? error.message
          : "時間をおいて再試行してください"
      );
    }
  };

  const updateEmoji = async (emoji: string) => {
    if (!(group && currentUserId)) {
      return;
    }

    try {
      await updateGroupEmoji({
        emoji,
        groupId: group._id,
        instantUserId: currentUserId,
      });
      toast.show({
        description: "グループの絵文字を更新しました。",
        label: "保存しました",
        variant: "success",
      });
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
    if (!(group && currentUserId)) {
      return;
    }

    try {
      await updateDisplayName({
        displayName,
        groupId: group._id,
        instantUserId: currentUserId,
      });
      setIsDisplayNameDialogOpen(false);
      toast.show({
        description: "あなたの表示名を更新しました。",
        label: "保存しました",
        variant: "success",
      });
    } catch (error) {
      Alert.alert(
        "保存できませんでした",
        error instanceof Error
          ? error.message
          : "時間をおいて再試行してください"
      );
    }
  };

  const regenerateInvite = async () => {
    if (!(group && currentUserId) || isRegeneratingInvite) {
      return;
    }

    setIsRegeneratingInvite(true);

    try {
      const result = await regenerateInviteCode({
        groupId: group._id,
        instantUserId: currentUserId,
      });
      setInviteDetails({
        groupEmoji: group.emoji,
        groupName: group.name,
        url: result.inviteUrl,
      });
      toast.show({
        description: "以前の招待URLは使えなくなりました。",
        label: "招待リンクを再発行しました",
        variant: "success",
      });
    } catch (error) {
      Alert.alert(
        "再発行できませんでした",
        error instanceof Error
          ? error.message
          : "時間をおいて再試行してください"
      );
    } finally {
      setIsRegeneratingInvite(false);
    }
  };

  const leaveGroup = () => {
    if (!(group && currentUserId) || isLeavingGroupRef.current) {
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
    const instantUserId = currentUserId;
    Alert.alert(
      title,
      message,
      [
        { style: "cancel", text: "キャンセル" },
        {
          onPress: async () => {
            isLeavingGroupRef.current = true;
            setIsLeaving(true);

            try {
              await leaveGroupMutation({
                groupId: targetGroupId,
                instantUserId,
              });
              setIsEditDialogOpen(false);
              router.replace("/group");
              toast.show({
                description: isLastMember
                  ? "最後のメンバーだったため、グループを削除しました。"
                  : "グループから脱退しました。",
                label: isLastMember
                  ? "グループを削除しました"
                  : "グループから脱退しました",
                variant: "success",
              });
            } catch (error) {
              Alert.alert(
                "脱退できませんでした",
                error instanceof Error
                  ? error.message
                  : "時間をおいて再試行してください"
              );
            } finally {
              isLeavingGroupRef.current = false;
              setIsLeaving(false);
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

  const removeMember = (member: GroupMember) => {
    if (!(group && currentUserId) || member.instantUserId === currentUserId) {
      return;
    }

    Alert.alert(
      `${member.displayName}さんを削除しますか？`,
      "このグループのメンバーではなくなり、シフト共有とチャットを見られなくなります。",
      [
        { style: "cancel", text: "キャンセル" },
        {
          onPress: async () => {
            try {
              await removeMemberMutation({
                groupId: group._id,
                instantUserId: currentUserId,
                targetInstantUserId: member.instantUserId,
              });
              toast.show({
                description: `${member.displayName}さんをグループから削除しました。`,
                label: "メンバーを削除しました",
                variant: "success",
              });
            } catch (error) {
              Alert.alert(
                "削除できませんでした",
                error instanceof Error
                  ? error.message
                  : "時間をおいて再試行してください"
              );
            }
          },
          style: "destructive",
          text: "削除",
        },
      ]
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
          title="設定"
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
          accessibilityLabel: "グループに戻る",
          icon: {
            android: "arrow_back",
            ios: "chevron.left",
            web: "arrow_back",
          },
          label: "戻る",
          onPress: goBack,
        }}
        title="設定"
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
        <Button
          accessibilityLabel="メンバーを招待"
          onPress={openInvite}
          size="md"
          variant="primary"
        >
          <SymbolView
            name={{
              android: "person_add",
              ios: "person.badge.plus",
              web: "person_add",
            }}
            size={18}
            tintColor={accentForegroundColor}
          />
          <Button.Label>メンバーを招待</Button.Label>
        </Button>
        <GroupSettingsSection
          group={group}
          onChangeEmoji={updateEmoji}
          onOpenDisplayNameEdit={() => {
            setIsDisplayNameDialogOpen(true);
          }}
          onOpenGroupNameEdit={() => {
            setIsEditDialogOpen(true);
          }}
        />
        <NotificationSection />
        <MemberSection
          currentUserId={currentUserId ?? ""}
          members={group.members}
          onRemoveMember={removeMember}
        />
        <DangerSection isLeaving={isLeaving} onLeave={leaveGroup} />
      </ScrollView>
      <GroupFormDialog
        group={group}
        initialGroupName={group.name}
        isDisplayNameVisible={false}
        isLeaving={isLeaving}
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSubmit={updateGroup}
        submitLabel="保存"
        title="グループ名を編集"
      />
      <DisplayNameFormDialog
        initialDisplayName={group.ownDisplayName}
        isOpen={isDisplayNameDialogOpen}
        onOpenChange={setIsDisplayNameDialogOpen}
        onSubmit={updateOwnDisplayName}
      />
      <InviteDialog
        inviteDetails={inviteDetails}
        isRegeneratingInvite={isRegeneratingInvite}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setInviteDetails(undefined);
          }
        }}
        onRegenerateInvite={regenerateInvite}
      />
    </View>
  );
}

const GroupSettingsSection = ({
  group,
  onChangeEmoji,
  onOpenGroupNameEdit,
  onOpenDisplayNameEdit,
}: {
  group: GroupDetail;
  onChangeEmoji: (emoji: string) => void;
  onOpenGroupNameEdit: () => void;
  onOpenDisplayNameEdit: () => void;
}) => (
  <View className="gap-3">
    <Text className="font-semibold text-lg">グループ</Text>
    <ListGroup>
      <EmojiPopup
        closeButton={EmojiPopupCloseButton}
        onEmojiSelected={onChangeEmoji}
      >
        <ListGroup.Item
          accessibilityLabel="グループアイコンを編集"
          disabled={Platform.OS === "android"}
        >
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle>アイコン</ListGroup.ItemTitle>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix>
            <Text className="text-3xl">{group.emoji}</Text>
          </ListGroup.ItemSuffix>
        </ListGroup.Item>
      </EmojiPopup>
      <Separator className="mx-4" />
      <ListGroup.Item
        accessibilityLabel="グループ名を編集"
        onPress={onOpenGroupNameEdit}
      >
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle>グループ名</ListGroup.ItemTitle>
          <ListGroup.ItemDescription numberOfLines={1}>
            {group.name}
          </ListGroup.ItemDescription>
        </ListGroup.ItemContent>
        <EditItemSuffix
          accessibilityLabel="グループ名を編集"
          onPress={onOpenGroupNameEdit}
        />
      </ListGroup.Item>
      <Separator className="mx-4" />
      <ListGroup.Item
        accessibilityLabel="あなたの名前を編集"
        onPress={onOpenDisplayNameEdit}
      >
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle>あなたの名前</ListGroup.ItemTitle>
          <ListGroup.ItemDescription numberOfLines={1}>
            {group.ownDisplayName}
          </ListGroup.ItemDescription>
        </ListGroup.ItemContent>
        <EditItemSuffix
          accessibilityLabel="あなたの名前を編集"
          onPress={onOpenDisplayNameEdit}
        />
      </ListGroup.Item>
    </ListGroup>
  </View>
);

const EditItemSuffix = ({
  accessibilityLabel,
  onPress,
}: {
  accessibilityLabel: string;
  onPress: () => void;
}) => (
  <ListGroup.ItemSuffix>
    <Button
      accessibilityLabel={accessibilityLabel}
      isIconOnly={true}
      onPress={onPress}
      size="sm"
      variant="ghost"
    >
      <SymbolView
        name={{ android: "edit", ios: "pencil", web: "edit" }}
        size={16}
      />
    </Button>
  </ListGroup.ItemSuffix>
);

const DangerSection = ({
  isLeaving,
  onLeave,
}: {
  isLeaving: boolean;
  onLeave: () => void;
}) => (
  <View className="gap-3">
    <Text className="font-semibold text-lg">危険な操作</Text>
    <ListGroup>
      <ListGroup.Item
        accessibilityLabel={isLeaving ? "処理中" : "グループから脱退"}
        disabled={isLeaving}
        onPress={onLeave}
      >
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle className="text-danger">
            {isLeaving ? "処理中" : "グループから脱退"}
          </ListGroup.ItemTitle>
        </ListGroup.ItemContent>
      </ListGroup.Item>
    </ListGroup>
  </View>
);

const NotificationSection = () => (
  <View className="gap-3">
    <Text className="font-semibold text-lg">通知</Text>
    <ListGroup>
      <ListGroup.Item disabled={true}>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle>全体チャット通知</ListGroup.ItemTitle>
          <ListGroup.ItemDescription>準備中</ListGroup.ItemDescription>
        </ListGroup.ItemContent>
        <ListGroup.ItemSuffix>
          <Switch isDisabled={true} isSelected={false} />
        </ListGroup.ItemSuffix>
      </ListGroup.Item>
    </ListGroup>
  </View>
);

const MemberSection = ({
  currentUserId,
  members,
  onRemoveMember,
}: {
  currentUserId: string;
  members: GroupMember[];
  onRemoveMember: (member: GroupMember) => void;
}) => {
  const ownMember = members.find(
    (member) => member.instantUserId === currentUserId
  );
  const otherMembers = members.filter(
    (member) => member.instantUserId !== currentUserId
  );
  const orderedMembers = ownMember ? [ownMember, ...otherMembers] : members;

  return (
    <View className="gap-3">
      <Text className="font-semibold text-lg">
        メンバー ({members.length}人)
      </Text>
      {orderedMembers.length > 0 ? (
        <ListGroup>
          {orderedMembers.map((member, index) => {
            const isOwnMember = member.instantUserId === currentUserId;

            return (
              <View key={member._id}>
                <MemberListItem
                  isOwnMember={isOwnMember}
                  member={member}
                  onRemove={() => {
                    onRemoveMember(member);
                  }}
                />
                {index < orderedMembers.length - 1 ? (
                  <Separator className="mx-4" />
                ) : null}
              </View>
            );
          })}
        </ListGroup>
      ) : (
        <Card className="p-4">
          <Text className="text-sm" color="muted">
            メンバーがいません
          </Text>
        </Card>
      )}
    </View>
  );
};

const MemberListItem = ({
  isOwnMember,
  member,
  onRemove,
}: {
  isOwnMember: boolean;
  member: GroupMember;
  onRemove: () => void;
}) => (
  <ListGroup.Item
    accessibilityLabel={
      isOwnMember
        ? `${member.displayName}さん（あなた）`
        : `${member.displayName}さん`
    }
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
    {isOwnMember ? null : (
      <ListGroup.ItemSuffix>
        <Button
          accessibilityLabel={`${member.displayName}さんをグループから削除`}
          isIconOnly={true}
          onPress={onRemove}
          size="sm"
          variant="ghost"
        >
          <SymbolView
            name={{
              android: "person_remove",
              ios: "person.badge.minus",
              web: "person_remove",
            }}
            size={16}
          />
        </Button>
      </ListGroup.ItemSuffix>
    )}
  </ListGroup.Item>
);
