import { useMutation, useQuery } from "convex/react";
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
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { AppHeader } from "@/components/navigation/app-header";
import { useCurrentUserId } from "@/lib/instant";
import { api as convexApi } from "../../../convex/_generated/api";

const INVALID_INVITE_MESSAGE = "この招待リンクは無効です";
const KEYBOARD_BOTTOM_OFFSET = 24;

export default function InviteScreen() {
  const router = useRouter();
  const currentUserId = useCurrentUserId();
  const accentForegroundColor = useThemeColor("accent-foreground");
  const { inviteCode } = useLocalSearchParams<{ inviteCode: string }>();
  const normalizedInviteCode =
    typeof inviteCode === "string" ? inviteCode.trim() : "";
  const displayNameRef = useRef("");
  const isJoiningRef = useRef(false);
  const [displayName, setDisplayName] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const invite = useQuery(
    convexApi.invites.preview,
    normalizedInviteCode
      ? { inviteCode: normalizedInviteCode, instantUserId: currentUserId }
      : "skip"
  );
  const joinInvite = useMutation(convexApi.invites.join);
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/group");
  }, [router]);

  const joinGroup = async () => {
    if (isJoiningRef.current) {
      return;
    }

    const trimmedDisplayName = displayNameRef.current.trim();

    if (!(normalizedInviteCode && invite)) {
      return;
    }

    if (!currentUserId) {
      Alert.alert("参加できません", "ユーザー情報の準備ができていません");
      return;
    }

    if (!trimmedDisplayName) {
      Alert.alert("表示名を入力してください");
      return;
    }

    isJoiningRef.current = true;
    setIsJoining(true);

    try {
      const result = await joinInvite({
        displayName: trimmedDisplayName,
        inviteCode: normalizedInviteCode,
        instantUserId: currentUserId,
      });
      router.replace(`/group?groupId=${result.groupId}`);
    } catch (error) {
      isJoiningRef.current = false;
      setIsJoining(false);
      Alert.alert(
        "参加できませんでした",
        error instanceof Error
          ? error.message
          : "時間をおいて再試行してください"
      );
    }
  };

  useEffect(() => {
    if (!invite?.isMember) {
      return;
    }

    router.replace(`/group?groupId=${invite.groupId}`);
  }, [invite, router]);

  const isLoadingInvite = normalizedInviteCode && invite === undefined;
  const isInvalidInvite = !normalizedInviteCode || invite === null;
  const title = invite?.groupName ?? "招待";
  const titleText = invite ? `${invite.groupEmoji} ${title}` : title;
  const isRedirectingToGroup = Boolean(invite?.isMember);
  const isSubmitDisabled =
    isJoining || isRedirectingToGroup || !invite || !displayName.trim();
  let description = "このグループに参加します";
  let formContent = (
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
  );

  if (isLoadingInvite) {
    description = "招待リンクを確認しています";
  } else if (isRedirectingToGroup) {
    description = "グループを開いています";
    formContent = <View />;
  } else if (isInvalidInvite) {
    formContent = (
      <Text className="text-base text-danger">{INVALID_INVITE_MESSAGE}</Text>
    );
  }

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
        title="グループ招待"
      />
      <KeyboardAwareScrollView
        bottomOffset={KEYBOARD_BOTTOM_OFFSET}
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          gap: 24,
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingVertical: 24,
        }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        mode="layout"
      >
        <View className="gap-2">
          <Text className="font-bold text-2xl">{titleText}</Text>
          <Text className="text-base" color="muted">
            {description}
          </Text>
        </View>
        {formContent}
      </KeyboardAwareScrollView>
    </View>
  );
}
