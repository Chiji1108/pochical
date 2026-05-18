import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import {
  Button,
  Card,
  Chip,
  Dialog,
  Input,
  Label,
  Text,
  TextField,
  useThemeColor,
} from "heroui-native";
import { useAll, useDb, useSession } from "jazz-tools/react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import { app, type ShareGroup, type ShareGroupMember } from "@/schema";

const StyledSafeAreaView = withUniwind(SafeAreaView);
const MAX_MEMBER_CHIPS = 5;
const TRAILING_SLASH_REGEX = /\/$/;

const getInviteApiBaseUrl = (): string => {
  const configuredBaseUrl =
    process.env.EXPO_PUBLIC_INVITE_API_BASE_URL ??
    process.env.EXPO_PUBLIC_INVITE_BASE_URL;

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(TRAILING_SLASH_REGEX, "");
  }

  return "";
};

type GroupFormDialogProps = {
  group?: ShareGroup;
  initialDisplayName?: string;
  initialGroupName?: string;
  isOpen: boolean;
  onLeave?: () => void;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (groupName: string, displayName: string) => void;
  submitLabel: string;
  title: string;
};

type MemberChipData = {
  displayName: string;
  id: string;
};

const getShareGroupMemberDisplayName = (member: ShareGroupMember): string =>
  member.displayName?.trim() || "名前未設定";

export default function Group() {
  const db = useDb();
  const router = useRouter();
  const session = useSession();
  const accentForegroundColor = useThemeColor("accent-foreground");
  const [editingGroup, setEditingGroup] = useState<ShareGroup>();
  const [creatingInviteGroupId, setCreatingInviteGroupId] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const currentUserId = session?.user_id ?? "";
  const groups = useAll(app.shareGroups);
  const memberships = useAll(
    currentUserId
      ? app.shareGroupMembers.where({ user_id: currentUserId })
      : undefined
  );
  const readableMembers = useAll(app.shareGroupMembers);
  const accessRows = useAll(app.shareGroupAccess);
  const hasLoadedGroups =
    Boolean(session) &&
    groups !== undefined &&
    memberships !== undefined &&
    readableMembers !== undefined &&
    accessRows !== undefined;
  const groupIds = useMemo(
    () => new Set((memberships ?? []).map((membership) => membership.groupId)),
    [memberships]
  );
  const memberCountsByGroupId = useMemo(() => {
    const nextCounts = new Map<string, number>();

    for (const member of readableMembers ?? []) {
      nextCounts.set(member.groupId, (nextCounts.get(member.groupId) ?? 0) + 1);
    }

    return nextCounts;
  }, [readableMembers]);
  const memberChipsByGroupId = useMemo(() => {
    const nextMembers = new Map<string, MemberChipData[]>();

    for (const member of readableMembers ?? []) {
      const groupMembers = nextMembers.get(member.groupId) ?? [];
      groupMembers.push({
        displayName: getShareGroupMemberDisplayName(member),
        id: member.id,
      });
      nextMembers.set(member.groupId, groupMembers);
    }

    for (const groupMembers of nextMembers.values()) {
      groupMembers.sort((a, b) =>
        a.displayName.localeCompare(b.displayName, "ja")
      );
    }

    return nextMembers;
  }, [readableMembers]);
  const ownMembershipByGroupId = useMemo(() => {
    const nextMemberships = new Map<string, ShareGroupMember>();

    for (const membership of memberships ?? []) {
      nextMemberships.set(membership.groupId, membership);
    }

    return nextMemberships;
  }, [memberships]);
  const joinedGroups = useMemo(
    () =>
      (groups ?? [])
        .filter((group) => groupIds.has(group.id))
        .sort((a, b) => a.name.localeCompare(b.name, "ja")),
    [groupIds, groups]
  );

  const createGroup = (groupName: string, displayName: string) => {
    if (!session) {
      return;
    }

    db.batch((batch) => {
      const group = batch.insert(app.shareGroups, { name: groupName });
      batch.insert(app.shareGroupMembers, {
        displayName,
        groupId: group.id,
        user_id: session.user_id,
      });
    });
    setIsCreateDialogOpen(false);
  };

  const updateGroup = (groupName: string, displayName: string) => {
    const membership = editingGroup
      ? ownMembershipByGroupId.get(editingGroup.id)
      : undefined;

    if (!(editingGroup && membership)) {
      return;
    }

    db.batch((batch) => {
      batch.update(app.shareGroups, editingGroup.id, { name: groupName });
      batch.update(app.shareGroupMembers, membership.id, { displayName });
    });
    setEditingGroup(undefined);
  };

  const leaveGroup = () => {
    const membership = editingGroup
      ? ownMembershipByGroupId.get(editingGroup.id)
      : undefined;

    if (!(editingGroup && membership && session)) {
      return;
    }

    const groupMembers = (readableMembers ?? []).filter(
      (member) => member.groupId === editingGroup.id
    );
    const isLastMember = groupMembers.length === 1;
    const title = isLastMember
      ? `${editingGroup.name}を削除しますか？`
      : `${editingGroup.name}から脱退しますか？`;
    let message =
      "このグループのメンバーには、あなたのシフトが共有されなくなります。";

    if (isLastMember) {
      message = "最後のメンバーのため、グループも削除されます。";
    }

    Alert.alert(title, message, [
      { style: "cancel", text: "キャンセル" },
      {
        onPress: () => {
          db.batch((batch) => {
            for (const access of accessRows ?? []) {
              if (
                access.groupId === editingGroup.id &&
                (access.ownerUserId === session.user_id ||
                  access.viewerUserId === session.user_id)
              ) {
                batch.delete(app.shareGroupAccess, access.id);
              }
            }

            if (isLastMember) {
              batch.delete(app.shareGroups, editingGroup.id);
            }

            batch.delete(app.shareGroupMembers, membership.id);
          });
          setEditingGroup(undefined);
        },
        style: "destructive",
        text: isLastMember ? "削除" : "脱退",
      },
    ]);
  };

  const createInvite = async (group: ShareGroup) => {
    const inviteApiBaseUrl = getInviteApiBaseUrl();

    if (!inviteApiBaseUrl && Platform.OS !== "web") {
      Alert.alert(
        "招待リンクを作成できません",
        "EXPO_PUBLIC_INVITE_BASE_URL を設定してください"
      );
      return;
    }

    setCreatingInviteGroupId(group.id);

    try {
      const response = await fetch(`${inviteApiBaseUrl}/api/invites`, {
        body: JSON.stringify({
          groupId: group.id,
          groupName: group.name,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("招待リンクを作成できませんでした");
      }

      const { url } = (await response.json()) as { url: string };
      await Share.share({
        message: `${group.name}のシフト共有に参加してください\n${url}`,
        url,
      });
    } catch (error) {
      Alert.alert(
        "招待リンクを作成できません",
        error instanceof Error
          ? error.message
          : "時間をおいて再試行してください"
      );
    } finally {
      setCreatingInviteGroupId("");
    }
  };

  let groupContent = <View className="flex-1" />;

  if (joinedGroups.length > 0) {
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
        {joinedGroups.map((group) => (
          <GroupListItem
            group={group}
            isCreatingInvite={creatingInviteGroupId === group.id}
            key={group.id}
            memberChips={memberChipsByGroupId.get(group.id) ?? []}
            memberCount={memberCountsByGroupId.get(group.id) ?? 0}
            onEdit={() => {
              setEditingGroup(group);
            }}
            onInvite={() => {
              createInvite(group);
            }}
            onOpen={() => {
              router.push(`/share-groups/${group.id}`);
            }}
          />
        ))}
      </ScrollView>
    );
  } else if (hasLoadedGroups) {
    groupContent = (
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Text className="text-center text-base" color="muted">
          共有グループがありません
        </Text>
        <Button
          accessibilityLabel="共有グループを作成"
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
          <Button.Label>共有グループを作成</Button.Label>
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
          <Button
            accessibilityLabel="共有グループを作成"
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
        {groupContent}
      </View>
      <GroupFormDialog
        isOpen={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={createGroup}
        submitLabel="保存"
        title="共有グループを作成"
      />
      <GroupFormDialog
        group={editingGroup}
        initialDisplayName={
          editingGroup
            ? ownMembershipByGroupId.get(editingGroup.id)?.displayName
            : undefined
        }
        initialGroupName={editingGroup?.name}
        isOpen={Boolean(editingGroup)}
        onLeave={leaveGroup}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setEditingGroup(undefined);
          }
        }}
        onSubmit={updateGroup}
        submitLabel="保存"
        title="グループを編集"
      />
    </StyledSafeAreaView>
  );
}

const GroupListItem = ({
  group,
  isCreatingInvite,
  memberChips,
  memberCount,
  onEdit,
  onInvite,
  onOpen,
}: {
  group: ShareGroup;
  isCreatingInvite: boolean;
  memberChips: MemberChipData[];
  memberCount: number;
  onEdit: () => void;
  onInvite: () => void;
  onOpen: () => void;
}) => {
  const visibleMemberChips = memberChips.slice(0, MAX_MEMBER_CHIPS);
  const hiddenMemberCount = memberCount - visibleMemberChips.length;

  return (
    <Card className="relative p-4">
      <View className="pr-10">
        <View className="min-w-0 gap-1">
          <Text className="font-semibold text-lg" numberOfLines={1}>
            {group.name}
          </Text>
          <View className="min-w-0 flex-row flex-wrap items-center gap-1">
            {visibleMemberChips.map((member) => (
              <Chip
                animation="disable-all"
                className="max-w-28"
                color="default"
                key={member.id}
                size="sm"
                variant="soft"
              >
                <Chip.Label numberOfLines={1}>{member.displayName}</Chip.Label>
              </Chip>
            ))}
            {hiddenMemberCount > 0 ? (
              <Chip
                animation="disable-all"
                color="default"
                size="sm"
                variant="soft"
              >
                <Chip.Label>+{hiddenMemberCount}</Chip.Label>
              </Chip>
            ) : null}
            {memberCount === 0 ? (
              <Text className="text-sm" color="muted">
                メンバーなし
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      <Button
        accessibilityLabel={`${group.name}を編集`}
        className="absolute top-3 right-3"
        isIconOnly={true}
        onPress={onEdit}
        size="sm"
        variant="ghost"
      >
        <SymbolView
          name={{ android: "edit", ios: "pencil", web: "edit" }}
          size={16}
        />
      </Button>
      <View className="mt-4 flex-row justify-end gap-2">
        <Button
          accessibilityLabel={`${group.name}に招待`}
          isDisabled={isCreatingInvite}
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
          <Button.Label>{isCreatingInvite ? "作成中" : "招待"}</Button.Label>
        </Button>
        <Button
          accessibilityLabel={`${group.name}のシフトを見る`}
          onPress={onOpen}
          size="sm"
          variant="primary"
        >
          <Button.Label>シフトを見る</Button.Label>
        </Button>
      </View>
    </Card>
  );
};

const GroupFormDialog = ({
  group,
  initialDisplayName = "",
  initialGroupName = "",
  isOpen,
  onLeave,
  onOpenChange,
  onSubmit,
  submitLabel,
  title,
}: GroupFormDialogProps) => {
  const groupNameRef = useRef(initialGroupName);
  const displayNameRef = useRef(initialDisplayName);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (isOpen) {
      groupNameRef.current = initialGroupName;
      displayNameRef.current = initialDisplayName;
      setFormKey((currentKey) => currentKey + 1);
    }
  }, [initialDisplayName, initialGroupName, isOpen]);

  const submit = () => {
    const trimmedGroupName = groupNameRef.current.trim();
    const trimmedDisplayName = displayNameRef.current.trim();

    if (!(trimmedGroupName && trimmedDisplayName)) {
      Alert.alert("グループ名とあなたの名前を入力してください");
      return;
    }

    onSubmit(trimmedGroupName, trimmedDisplayName);
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
              <Dialog.Title>{title}</Dialog.Title>
            </View>
            <View className="gap-4">
              <TextField>
                <Label>グループ名</Label>
                <Input
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus={true}
                  defaultValue={initialGroupName}
                  key={`group-name-${formKey}`}
                  onChangeText={(text) => {
                    groupNameRef.current = text;
                  }}
                  placeholder="グループ名"
                  returnKeyType="next"
                />
                {/* <Description>全員に共有されます</Description> */}
              </TextField>
              <TextField>
                <Label>あなたの名前</Label>
                <Input
                  autoCapitalize="none"
                  autoCorrect={false}
                  defaultValue={initialDisplayName}
                  key={`display-name-${formKey}`}
                  onChangeText={(text) => {
                    displayNameRef.current = text;
                  }}
                  onSubmitEditing={submit}
                  placeholder="例: 佐藤"
                  returnKeyType="done"
                />
              </TextField>
            </View>
            <View className="mt-5 flex-row justify-end gap-3">
              {group ? (
                <Button onPress={onLeave} size="sm" variant="outline">
                  <Button.Label>脱退</Button.Label>
                </Button>
              ) : null}
              {group ? <View className="flex-1" /> : null}
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
                <Button.Label>{submitLabel}</Button.Label>
              </Button>
            </View>
          </Dialog.Content>
        </KeyboardAvoidingView>
      </Dialog.Portal>
    </Dialog>
  );
};
