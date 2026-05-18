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

const fetchInvitePreview = async (inviteId: string): Promise<InvitePreview> => {
  const response = await fetch(
    `${getInviteApiBaseUrl()}/api/invites/${encodeURIComponent(inviteId)}`
  );

  if (!response.ok) {
    throw new Error("招待リンクが無効または期限切れです");
  }

  return (await response.json()) as InvitePreview;
};

const loadInvitePreview = async (
  inviteId?: string
): Promise<{ errorMessage?: string; invite?: InvitePreview }> => {
  if (!inviteId) {
    return { errorMessage: "招待リンクが正しくありません" };
  }

  try {
    return { invite: await fetchInvitePreview(inviteId) };
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
  const { inviteId } = useLocalSearchParams<{ inviteId: string }>();
  const displayNameRef = useRef("");
  const [displayName, setDisplayName] = useState("");
  const [invite, setInvite] = useState<InvitePreview>();
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoadingInvite, setIsLoadingInvite] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const currentUserId = session?.user_id ?? "";
  const groupMembers = useAll(
    invite
      ? app.shareGroupMembers.where({ groupId: invite.groupId })
      : undefined
  );
  const ownMembership = useMemo(
    () =>
      (groupMembers ?? []).find((member) => member.user_id === currentUserId),
    [currentUserId, groupMembers]
  );
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/group");
  }, [router]);

  useEffect(() => {
    let isMounted = true;

    const loadInvite = async () => {
      const result = await loadInvitePreview(inviteId);

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
  }, [inviteId]);

  useEffect(() => {
    if (!(invite && ownMembership)) {
      return;
    }

    router.replace(`/share-groups/${ownMembership.groupId}`);
  }, [invite, ownMembership, router]);

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
      router.replace(`/share-groups/${invite.groupId}`);
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
          onPress: goBack,
        }}
        title="シフト共有招待"
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
                : "このシフト共有に参加します"}
            </Text>
          </View>
          {errorMessage ? (
            <Text className="text-base text-danger">{errorMessage}</Text>
          ) : (
            <View className="gap-5">
              <TextField>
                <Label>シフト共有内での表示名</Label>
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
