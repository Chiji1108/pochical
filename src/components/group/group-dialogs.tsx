import { setStringAsync } from "expo-clipboard";
import { SymbolView } from "expo-symbols";
import {
  Button,
  Dialog,
  Input,
  Label,
  Text,
  TextField,
  useThemeColor,
} from "heroui-native";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Share,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

export type InviteDetails = {
  groupName: string;
  url: string;
};

type EditableGroup = {
  _id: string;
};

type GroupFormDialogProps = {
  group?: EditableGroup;
  initialDisplayName?: string;
  initialGroupName?: string;
  isDisplayNameVisible?: boolean;
  isOpen: boolean;
  isLeaving?: boolean;
  onLeave?: () => void;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (groupName: string, displayName: string) => Promise<void> | void;
  submitLabel: string;
  title: string;
};

type DisplayNameFormDialogProps = {
  initialDisplayName?: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (displayName: string) => Promise<void> | void;
};

export const InviteDialog = ({
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

export const GroupFormDialog = ({
  group,
  initialDisplayName = "",
  initialGroupName = "",
  isDisplayNameVisible = true,
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

    if (!(trimmedGroupName && (!isDisplayNameVisible || trimmedDisplayName))) {
      Alert.alert(
        isDisplayNameVisible
          ? "グループ名とあなたの名前を入力してください"
          : "グループ名を入力してください"
      );
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
                  onSubmitEditing={isDisplayNameVisible ? undefined : submit}
                  placeholder="グループ名"
                  returnKeyType={isDisplayNameVisible ? "next" : "done"}
                />
              </TextField>
              {isDisplayNameVisible ? (
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
              ) : null}
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

export const DisplayNameFormDialog = ({
  initialDisplayName = "",
  isOpen,
  onOpenChange,
  onSubmit,
}: DisplayNameFormDialogProps) => {
  const displayNameRef = useRef(initialDisplayName);
  const isSubmittingRef = useRef(false);
  const [formKey, setFormKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      displayNameRef.current = initialDisplayName;
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setFormKey((currentKey) => currentKey + 1);
    }
  }, [initialDisplayName, isOpen]);

  const submit = async () => {
    if (isSubmittingRef.current) {
      return;
    }

    const trimmedDisplayName = displayNameRef.current.trim();

    if (!trimmedDisplayName) {
      Alert.alert("あなたの名前を入力してください");
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      await onSubmit(trimmedDisplayName);
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
              <Dialog.Title>あなたの名前を編集</Dialog.Title>
            </View>
            <TextField>
              <Label>あなたの名前</Label>
              <Input
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus={true}
                defaultValue={initialDisplayName}
                editable={!isSubmitting}
                key={`own-display-name-${formKey}`}
                onChangeText={(text) => {
                  displayNameRef.current = text;
                }}
                onSubmitEditing={submit}
                placeholder="例: 佐藤"
                returnKeyType="done"
              />
            </TextField>
            <View className="mt-5 flex-row justify-end gap-3">
              <Button
                isDisabled={isSubmitting}
                onPress={() => {
                  onOpenChange(false);
                }}
                size="sm"
                variant="ghost"
              >
                <Button.Label>キャンセル</Button.Label>
              </Button>
              <Button
                isDisabled={isSubmitting}
                onPress={submit}
                size="sm"
                variant="primary"
              >
                <Button.Label>{isSubmitting ? "保存中" : "保存"}</Button.Label>
              </Button>
            </View>
          </Dialog.Content>
        </KeyboardAvoidingView>
      </Dialog.Portal>
    </Dialog>
  );
};
