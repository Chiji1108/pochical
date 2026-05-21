import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { Input, ListGroup, Separator, Text, TextField } from "heroui-native";
import { useSession } from "jazz-tools/react-native";
import { useRef, useState } from "react";
import { Alert, Platform, ScrollView, View } from "react-native";
import { EmojiPopup } from "react-native-emoji-popup";
import { EmojiPopupCloseButton } from "@/components/common/emoji-popup-close-button";
import { DEFAULT_GROUP_EMOJI } from "@/components/group/group-dialogs";
import { AppHeader } from "@/components/navigation/app-header";
import { api as convexApi } from "../../../convex/_generated/api";

export default function NewShareGroup() {
  const router = useRouter();
  const session = useSession();
  const createGroupMutation = useMutation(convexApi.groups.create);
  const groupNameRef = useRef("");
  const displayNameRef = useRef("");
  const isSubmittingRef = useRef(false);
  const [groupEmoji, setGroupEmoji] = useState(DEFAULT_GROUP_EMOJI);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/group");
  };

  const createGroup = async () => {
    if (isSubmittingRef.current) {
      return;
    }

    if (!session) {
      Alert.alert("作成できません", "ユーザー情報の準備ができていません");
      return;
    }

    const groupName = groupNameRef.current.trim();
    const displayName = displayNameRef.current.trim();

    if (!(groupName && displayName)) {
      Alert.alert("グループ名とあなたの名前を入力してください");
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const result = await createGroupMutation({
        displayName,
        emoji: groupEmoji,
        jazzUserId: session.user_id,
        name: groupName,
      });
      router.replace(`/group?groupId=${result.groupId}&showInvite=1`);
    } catch (error) {
      Alert.alert(
        "作成できませんでした",
        error instanceof Error
          ? error.message
          : "時間をおいて再試行してください"
      );
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

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
        rightAction={{
          accessibilityLabel: "グループを保存",
          isDisabled: isSubmitting || !session,
          label: isSubmitting ? "保存中" : "保存",
          onPress: createGroup,
          variant: "primary",
        }}
        title="グループを作成"
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          gap: 16,
          paddingBottom: 24,
          paddingHorizontal: 16,
          paddingTop: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <ListGroup>
          <EmojiPopup
            closeButton={EmojiPopupCloseButton}
            onEmojiSelected={setGroupEmoji}
          >
            <ListGroup.Item
              accessibilityLabel="グループアイコンを選択"
              disabled={Platform.OS === "android"}
            >
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>アイコン</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix>
                <Text className="text-3xl">{groupEmoji}</Text>
              </ListGroup.ItemSuffix>
            </ListGroup.Item>
          </EmojiPopup>
          <Separator className="mx-4" />
          <ListGroup.Item>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>グループ名</ListGroup.ItemTitle>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix className="w-32">
              <TextField>
                <Input
                  accessibilityLabel="グループ名"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus={true}
                  editable={!isSubmitting}
                  onChangeText={(text) => {
                    groupNameRef.current = text;
                  }}
                  placeholder="グループ名"
                  returnKeyType="next"
                />
              </TextField>
            </ListGroup.ItemSuffix>
          </ListGroup.Item>
          <Separator className="mx-4" />
          <ListGroup.Item>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>あなたの名前</ListGroup.ItemTitle>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix className="w-32">
              <TextField>
                <Input
                  accessibilityLabel="あなたの名前"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isSubmitting}
                  onChangeText={(text) => {
                    displayNameRef.current = text;
                  }}
                  onSubmitEditing={createGroup}
                  placeholder="例: 佐藤"
                  returnKeyType="done"
                />
              </TextField>
            </ListGroup.ItemSuffix>
          </ListGroup.Item>
        </ListGroup>
      </ScrollView>
    </View>
  );
}
