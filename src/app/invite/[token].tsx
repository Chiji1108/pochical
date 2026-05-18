import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import {
  Button,
  Input,
  Label,
  Text,
  TextField,
  useThemeColor,
} from "heroui-native";
import { useAll, useDb, useSession } from "jazz-tools/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, View } from "react-native";
import { AppHeader } from "@/components/navigation/app-header";
import { app } from "@/schema";

type InvitePreview = {
  expiresAt: number;
  groupId: string;
  groupName: string;
};

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

const fetchInvitePreview = async (token: string): Promise<InvitePreview> => {
  const response = await fetch(
    `${getInviteApiBaseUrl()}/api/invites/${encodeURIComponent(token)}`
  );

  if (!response.ok) {
    throw new Error("招待リンクが無効または期限切れです");
  }

  return (await response.json()) as InvitePreview;
};

const loadInvitePreview = async (
  token?: string
): Promise<{ errorMessage?: string; invite?: InvitePreview }> => {
  if (!token) {
    return { errorMessage: "招待リンクが正しくありません" };
  }

  try {
    return { invite: await fetchInvitePreview(token) };
  } catch (error) {
    return {
      errorMessage:
        error instanceof Error
          ? error.message
          : "招待リンクを確認できませんでした",
    };
  }
};

export default function InviteScreen() {
  const db = useDb();
  const router = useRouter();
  const session = useSession();
  const accentForegroundColor = useThemeColor("accent-foreground");
  const { token } = useLocalSearchParams<{ token: string }>();
  const displayNameRef = useRef("");
  const [displayName, setDisplayName] = useState("");
  const [invite, setInvite] = useState<InvitePreview>();
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoadingInvite, setIsLoadingInvite] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [isPreparingAccess, setIsPreparingAccess] = useState(false);
  const currentUserId = session?.user_id ?? "";
  const groupMembers = useAll(
    invite
      ? app.shareGroupMembers.where({ groupId: invite.groupId })
      : undefined
  );
  const accessRows = useAll(
    invite ? app.shareGroupAccess.where({ groupId: invite.groupId }) : undefined
  );
  const ownMembership = useMemo(
    () =>
      (groupMembers ?? []).find((member) => member.user_id === currentUserId),
    [currentUserId, groupMembers]
  );

  useEffect(() => {
    let isMounted = true;

    const loadInvite = async () => {
      const result = await loadInvitePreview(token);

      if (!isMounted) {
        return;
      }

      setInvite(result.invite);
      setErrorMessage(result.errorMessage ?? "");
      setIsLoadingInvite(false);
    };

    loadInvite();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const ensureAccessRows = useCallback(() => {
    if (!(invite && session && groupMembers && accessRows)) {
      return false;
    }

    const otherUserIds = new Set(
      groupMembers
        .map((member) => member.user_id)
        .filter((userId) => userId !== session.user_id)
    );

    if (otherUserIds.size === 0) {
      return true;
    }

    const existingAccessKeys = new Set(
      accessRows.map((access) => `${access.ownerUserId}:${access.viewerUserId}`)
    );

    db.batch((batch) => {
      for (const otherUserId of otherUserIds) {
        const currentUserCanViewOther = `${otherUserId}:${session.user_id}`;
        const otherCanViewCurrentUser = `${session.user_id}:${otherUserId}`;

        if (!existingAccessKeys.has(currentUserCanViewOther)) {
          batch.insert(app.shareGroupAccess, {
            groupId: invite.groupId,
            ownerUserId: otherUserId,
            viewerUserId: session.user_id,
          });
        }

        if (!existingAccessKeys.has(otherCanViewCurrentUser)) {
          batch.insert(app.shareGroupAccess, {
            groupId: invite.groupId,
            ownerUserId: session.user_id,
            viewerUserId: otherUserId,
          });
        }
      }
    });

    return true;
  }, [accessRows, db, groupMembers, invite, session]);

  useEffect(() => {
    if (!isPreparingAccess) {
      return;
    }

    if (!(ownMembership && ensureAccessRows())) {
      return;
    }

    setIsPreparingAccess(false);
    setIsJoining(false);
    router.replace(`/share-groups/${ownMembership.groupId}`);
  }, [ensureAccessRows, isPreparingAccess, ownMembership, router]);

  const joinGroup = async () => {
    const trimmedDisplayName = displayNameRef.current.trim();

    if (!invite) {
      return;
    }

    if (!session) {
      Alert.alert("参加できません", "ユーザー情報の準備ができていません");
      return;
    }

    if (!trimmedDisplayName) {
      Alert.alert("表示名を入力してください");
      return;
    }

    setIsJoining(true);

    try {
      if (ownMembership) {
        await db
          .update(app.shareGroupMembers, ownMembership.id, {
            displayName: trimmedDisplayName,
          })
          .wait({ tier: "edge" });
        ensureAccessRows();
        router.replace(`/share-groups/${invite.groupId}`);
        return;
      }

      await db
        .insert(app.shareGroupMembers, {
          displayName: trimmedDisplayName,
          groupId: invite.groupId,
          user_id: session.user_id,
        })
        .wait({ tier: "edge" });
      setIsPreparingAccess(true);
    } catch (error) {
      setIsJoining(false);
      Alert.alert(
        "参加できませんでした",
        error instanceof Error
          ? error.message
          : "時間をおいて再試行してください"
      );
    }
  };

  const title = invite?.groupName ?? "招待";
  const isSubmitDisabled = isJoining || !invite || !displayName.trim();

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        leftAction={{
          accessibilityLabel: "戻る",
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
        title="グループ招待"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-1 justify-center gap-6 px-6">
          <View className="gap-2">
            <Text className="font-bold text-2xl">{title}</Text>
            <Text className="text-base" color="muted">
              {isLoadingInvite
                ? "招待リンクを確認しています"
                : "このグループに参加します"}
            </Text>
          </View>
          {errorMessage ? (
            <Text className="text-base text-danger">{errorMessage}</Text>
          ) : (
            <View className="gap-5">
              <TextField>
                <Label>グループ内での表示名</Label>
                <Input
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isJoining}
                  onChangeText={(text) => {
                    displayNameRef.current = text;
                    setDisplayName(text);
                  }}
                  onSubmitEditing={joinGroup}
                  placeholder="例: 佐藤"
                  returnKeyType="done"
                />
              </TextField>
              <Button
                accessibilityLabel={`${title}に参加`}
                isDisabled={isSubmitDisabled}
                onPress={joinGroup}
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
                <Button.Label>{isJoining ? "参加中" : "参加する"}</Button.Label>
              </Button>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
