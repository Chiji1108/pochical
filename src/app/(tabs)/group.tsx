import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { setStringAsync } from "expo-clipboard";
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
import { useSession } from "jazz-tools/react-native";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import { api as convexApi } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const StyledSafeAreaView = withUniwind(SafeAreaView);
const MAX_MEMBER_CHIPS = 5;

type ConvexGroupSummary = FunctionReturnType<
  typeof convexApi.groups.listForCurrentUser
>[number];

type GroupFormDialogProps = {
  group?: ConvexGroupSummary;
  initialDisplayName?: string;
  initialGroupName?: string;
  isOpen: boolean;
  isLeaving?: boolean;
  onLeave?: () => void;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (groupName: string, displayName: string) => Promise<void> | void;
  submitLabel: string;
  title: string;
};

type InviteDetails = {
  groupName: string;
  url: string;
};

export default function Group() {
  const router = useRouter();
  const session = useSession();
  const accentForegroundColor = useThemeColor("accent-foreground");
  const [editingGroup, setEditingGroup] = useState<ConvexGroupSummary>();
  const [inviteDetails, setInviteDetails] = useState<InviteDetails>();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const isLeavingGroupRef = useRef(false);
  const [leavingGroupId, setLeavingGroupId] = useState<Id<"groups"> | "">("");
  const [pendingGroupId, setPendingGroupId] = useState("");
  const currentUserId = session?.user_id ?? "";
  const groups = useQuery(
    convexApi.groups.listForCurrentUser,
    currentUserId ? { jazzUserId: currentUserId } : "skip"
  );
  const createGroupMutation = useMutation(convexApi.groups.create);
  const updateGroupName = useMutation(convexApi.groups.updateName);
  const updateDisplayName = useMutation(convexApi.groups.updateDisplayName);
  const leaveGroupMutation = useMutation(convexApi.groups.leave);
  const hasLoadedGroups = Boolean(session) && groups !== undefined;

  const createGroup = async (groupName: string, displayName: string) => {
    if (!session) {
      return;
    }

    try {
      await createGroupMutation({
        displayName,
        jazzUserId: session.user_id,
        name: groupName,
      });
      setIsCreateDialogOpen(false);
    } catch (error) {
      Alert.alert(
        "作成できませんでした",
        error instanceof Error
          ? error.message
          : "時間をおいて再試行してください"
      );
    }
  };

  const updateGroup = async (groupName: string, displayName: string) => {
    if (!(editingGroup && session)) {
      return;
    }

    const groupId = editingGroup._id;

    try {
      await Promise.all([
        updateGroupName({
          groupId,
          jazzUserId: session.user_id,
          name: groupName,
        }),
        updateDisplayName({
          displayName,
          groupId,
          jazzUserId: session.user_id,
        }),
      ]);
      setEditingGroup(undefined);
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
    if (!(editingGroup && session) || isLeavingGroupRef.current) {
      return;
    }

    const isLastMember = editingGroup.memberCount === 1;
    const title = isLastMember
      ? `${editingGroup.name}を削除しますか？`
      : `${editingGroup.name}から脱退しますか？`;
    const message = isLastMember
      ? "最後のメンバーのため、グループも削除されます。"
      : "このグループのメンバーには、あなたのシフトが共有されなくなります。";
    const groupId = editingGroup._id;
    const jazzUserId = session.user_id;
    const clearLeaveLock = () => {
      isLeavingGroupRef.current = false;
      setLeavingGroupId("");
    };

    isLeavingGroupRef.current = true;
    setLeavingGroupId(groupId);

    Alert.alert(
      title,
      message,
      [
        { onPress: clearLeaveLock, style: "cancel", text: "キャンセル" },
        {
          onPress: async () => {
            try {
              await leaveGroupMutation({ groupId, jazzUserId });
              setEditingGroup(undefined);
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

  const openInvite = (group: ConvexGroupSummary) => {
    setInviteDetails({ groupName: group.name, url: group.inviteUrl });
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
            isPending={pendingGroupId === group._id}
            key={group._id}
            onEdit={() => {
              setEditingGroup(group);
            }}
            onInvite={() => {
              openInvite(group);
            }}
            onOpen={() => {
              router.push(`/share-groups/${group._id}`);
            }}
            setPendingGroupId={setPendingGroupId}
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
      <GroupFormDialog
        group={editingGroup}
        initialDisplayName={editingGroup?.ownDisplayName}
        initialGroupName={editingGroup?.name}
        isLeaving={
          Boolean(editingGroup) && leavingGroupId === editingGroup?._id
        }
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
      <InviteDialog
        inviteDetails={inviteDetails}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setInviteDetails(undefined);
          }
        }}
      />
    </StyledSafeAreaView>
  );
}

const GroupListItem = ({
  group,
  isPending,
  onEdit,
  onInvite,
  onOpen,
  setPendingGroupId,
}: {
  group: ConvexGroupSummary;
  isPending: boolean;
  onEdit: () => void;
  onInvite: () => void;
  onOpen: () => void;
  setPendingGroupId: (groupId: Id<"groups"> | "") => void;
}) => {
  const visibleMemberChips = group.members.slice(0, MAX_MEMBER_CHIPS);
  const hiddenMemberCount = group.memberCount - visibleMemberChips.length;

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
                key={member._id}
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
            {group.memberCount === 0 ? (
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
          isDisabled={isPending}
          onPress={() => {
            setPendingGroupId(group._id);
            onInvite();
            setPendingGroupId("");
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
          <Button.Label>招待</Button.Label>
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

const InviteDialog = ({
  inviteDetails,
  onOpenChange,
}: {
  inviteDetails?: InviteDetails;
  onOpenChange: (isOpen: boolean) => void;
}) => {
  const accentForegroundColor = useThemeColor("accent-foreground");
  const isOpen = Boolean(inviteDetails);
  const shareInvite = async () => {
    if (!inviteDetails) {
      return;
    }

    const shareMessage = `${inviteDetails.groupName}に参加してください\n${inviteDetails.url}`;
    const shareUrl = inviteDetails.url;

    try {
      onOpenChange(false);

      await Share.share({
        message: shareMessage,
        url: shareUrl,
      });
    } catch (error) {
      Alert.alert(
        "共有できません",
        error instanceof Error
          ? error.message
          : "時間をおいて再試行してください"
      );
    }
  };
  const copyInviteUrl = async () => {
    if (!inviteDetails) {
      return;
    }

    await setStringAsync(inviteDetails.url);
    Alert.alert("コピーしました", "招待URLをクリップボードにコピーしました");
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Close variant="ghost" />
          <View className="mb-5 gap-1.5">
            <Dialog.Title>招待</Dialog.Title>
            {inviteDetails ? (
              <Text className="text-sm" color="muted">
                {inviteDetails.groupName}に参加するためのリンクです
              </Text>
            ) : null}
          </View>
          {inviteDetails ? (
            <View className="items-center gap-5">
              <View className="rounded-lg bg-white p-4">
                <QRCode size={200} value={inviteDetails.url} />
              </View>
              <View className="w-full gap-2">
                <Label>招待URL</Label>
                <View className="rounded-lg border border-border bg-content1 px-3 py-2">
                  <Text className="text-sm" selectable={true}>
                    {inviteDetails.url}
                  </Text>
                </View>
              </View>
              <View className="w-full flex-row gap-3">
                <Button
                  accessibilityLabel="招待URLをコピー"
                  className="flex-1"
                  onPress={copyInviteUrl}
                  size="sm"
                  variant="outline"
                >
                  <SymbolView
                    name={{
                      android: "content_copy",
                      ios: "doc.on.doc",
                      web: "content_copy",
                    }}
                    size={16}
                  />
                  <Button.Label>コピー</Button.Label>
                </Button>
                <Button
                  accessibilityLabel="招待URLを共有"
                  className="flex-1"
                  onPress={shareInvite}
                  size="sm"
                  variant="primary"
                >
                  <SymbolView
                    name={{
                      android: "share",
                      ios: "square.and.arrow.up",
                      web: "share",
                    }}
                    size={16}
                    tintColor={accentForegroundColor}
                  />
                  <Button.Label>共有</Button.Label>
                </Button>
              </View>
            </View>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
};

const GroupFormDialog = ({
  group,
  initialDisplayName = "",
  initialGroupName = "",
  isOpen,
  isLeaving = false,
  onLeave,
  onOpenChange,
  onSubmit,
  submitLabel,
  title,
}: GroupFormDialogProps) => {
  const groupNameRef = useRef(initialGroupName);
  const displayNameRef = useRef(initialDisplayName);
  const isSubmittingRef = useRef(false);
  const [formKey, setFormKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      groupNameRef.current = initialGroupName;
      displayNameRef.current = initialDisplayName;
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setFormKey((currentKey) => currentKey + 1);
    }
  }, [initialDisplayName, initialGroupName, isOpen]);

  const submit = async () => {
    if (isSubmittingRef.current) {
      return;
    }

    const trimmedGroupName = groupNameRef.current.trim();
    const trimmedDisplayName = displayNameRef.current.trim();

    if (!(trimmedGroupName && trimmedDisplayName)) {
      Alert.alert("グループ名とあなたの名前を入力してください");
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      await onSubmit(trimmedGroupName, trimmedDisplayName);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
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
                  editable={!isSubmitting}
                  key={`group-name-${formKey}`}
                  onChangeText={(text) => {
                    groupNameRef.current = text;
                  }}
                  placeholder="グループ名"
                  returnKeyType="next"
                />
              </TextField>
              <TextField>
                <Label>あなたの名前</Label>
                <Input
                  autoCapitalize="none"
                  autoCorrect={false}
                  defaultValue={initialDisplayName}
                  editable={!isSubmitting}
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
                <Button
                  isDisabled={isSubmitting || isLeaving}
                  onPress={onLeave}
                  size="sm"
                  variant="outline"
                >
                  <Button.Label>{isLeaving ? "処理中" : "脱退"}</Button.Label>
                </Button>
              ) : null}
              {group ? <View className="flex-1" /> : null}
              <Button
                isDisabled={isSubmitting || isLeaving}
                onPress={() => {
                  onOpenChange(false);
                }}
                size="sm"
                variant="ghost"
              >
                <Button.Label>キャンセル</Button.Label>
              </Button>
              <Button
                isDisabled={isSubmitting || isLeaving}
                onPress={submit}
                size="sm"
                variant="primary"
              >
                <Button.Label>
                  {isSubmitting ? "保存中" : submitLabel}
                </Button.Label>
              </Button>
            </View>
          </Dialog.Content>
        </KeyboardAvoidingView>
      </Dialog.Portal>
    </Dialog>
  );
};
