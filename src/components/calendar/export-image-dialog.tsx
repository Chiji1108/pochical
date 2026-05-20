import { Image } from "expo-image";
import {
  requestPermissionsAsync,
  saveToLibraryAsync,
} from "expo-media-library";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { SymbolView } from "expo-symbols";
import { Button, Dialog, Spinner, Text } from "heroui-native";
import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { captureRef } from "react-native-view-shot";

type ExportImageDialogProps = {
  captureTargetRef: RefObject<View | null>;
  isOpen: boolean;
  monthLabel: string;
  onChangeOpen: (isOpen: boolean) => void;
};

type ExportImageDialogStatus = {
  message: string;
  title: string;
  tone: "error" | "success";
};

export const ExportImageDialog = ({
  captureTargetRef,
  isOpen,
  monthLabel,
  onChangeOpen,
}: ExportImageDialogProps) => {
  const [imageUri, setImageUri] = useState<string>();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [status, setStatus] = useState<ExportImageDialogStatus>();

  const captureImage = useCallback(async () => {
    const captureTarget = captureTargetRef.current;

    if (!captureTarget) {
      setImageUri(undefined);
      setStatus({
        message: "画像にするカレンダーを準備できませんでした。",
        title: "画像を作成できません",
        tone: "error",
      });
      return;
    }

    setIsCapturing(true);
    setStatus(undefined);

    try {
      const nextImageUri = await captureRef(captureTarget, {
        fileName: `nurse-shift-${monthLabel}`,
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      setImageUri(nextImageUri);
    } catch {
      setImageUri(undefined);
      setStatus({
        message:
          "カレンダー画像を作成できませんでした。もう一度お試しください。",
        title: "画像を作成できません",
        tone: "error",
      });
    } finally {
      setIsCapturing(false);
    }
  }, [captureTargetRef, monthLabel]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setImageUri(undefined);
    setStatus(undefined);
    const captureTimer = setTimeout(() => {
      captureImage().catch(() => {
        setStatus({
          message:
            "カレンダー画像を作成できませんでした。もう一度お試しください。",
          title: "画像を作成できません",
          tone: "error",
        });
      });
    }, 80);

    return () => {
      clearTimeout(captureTimer);
    };
  }, [captureImage, isOpen]);

  const saveImage = async () => {
    if (!imageUri) {
      return;
    }

    if (Platform.OS === "web") {
      setStatus({
        message: "画像保存は iOS / Android で利用できます。",
        title: "保存できません",
        tone: "error",
      });
      return;
    }

    setIsSaving(true);
    setStatus(undefined);

    try {
      const permission = await requestPermissionsAsync(true);

      if (!permission.granted) {
        setStatus({
          message:
            "写真ライブラリへの保存を許可してから、もう一度お試しください。",
          title: "写真への保存権限が必要です",
          tone: "error",
        });
        return;
      }

      await saveToLibraryAsync(imageUri);
      setStatus({
        message: `${monthLabel}のシフト画像を写真ライブラリに保存しました。`,
        title: "保存しました",
        tone: "success",
      });
    } catch {
      setStatus({
        message: "画像を写真ライブラリに保存できませんでした。",
        title: "保存に失敗しました",
        tone: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const shareImage = async () => {
    if (!imageUri) {
      return;
    }

    setIsSharing(true);
    setStatus(undefined);

    try {
      const isSharingAvailable = await isAvailableAsync();

      if (!isSharingAvailable) {
        setStatus({
          message: "この環境では画像共有を利用できません。",
          title: "共有できません",
          tone: "error",
        });
        return;
      }

      await shareAsync(imageUri, {
        dialogTitle: `${monthLabel}のシフト画像を共有`,
        mimeType: "image/png",
        UTI: "public.png",
      });
    } catch {
      setStatus({
        message: "画像を共有できませんでした。もう一度お試しください。",
        title: "共有に失敗しました",
        tone: "error",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const isActionDisabled = isCapturing || isSaving || isSharing || !imageUri;

  return (
    <Dialog isOpen={isOpen} onOpenChange={onChangeOpen}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Close variant="ghost" />
          <View className="mb-5 gap-2">
            <Dialog.Title>画像に書き出す</Dialog.Title>
            <Dialog.Description>
              {`${monthLabel}のシフトを画像として保存または共有します。`}
            </Dialog.Description>
          </View>
          <View className="mb-5 gap-3">
            <View className="aspect-[7/6] overflow-hidden rounded-lg border border-border bg-foreground/5">
              {imageUri ? (
                <Image
                  accessibilityLabel={`${monthLabel}のシフト画像プレビュー`}
                  contentFit="contain"
                  source={{ uri: imageUri }}
                  style={{ height: "100%", width: "100%" }}
                />
              ) : (
                <View className="flex-1 items-center justify-center gap-2">
                  {isCapturing ? <Spinner size="sm" /> : null}
                  <Text className="text-sm" color="muted">
                    {isCapturing
                      ? "プレビューを作成しています"
                      : "プレビューがありません"}
                  </Text>
                </View>
              )}
            </View>
            {status ? (
              <View
                className={
                  status.tone === "success"
                    ? "rounded-lg bg-success-soft px-3 py-2"
                    : "rounded-lg bg-danger-soft px-3 py-2"
                }
              >
                <Text
                  className={
                    status.tone === "success"
                      ? "font-semibold text-sm text-success"
                      : "font-semibold text-danger text-sm"
                  }
                >
                  {status.title}
                </Text>
                <Text className="text-sm" color="muted">
                  {status.message}
                </Text>
              </View>
            ) : null}
          </View>
          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              isDisabled={isActionDisabled}
              onPress={saveImage}
              variant="outline"
            >
              <SymbolView
                name={{
                  android: "save",
                  ios: "square.and.arrow.down",
                  web: "save",
                }}
                size={18}
              />
              <Button.Label>{isSaving ? "保存中" : "保存"}</Button.Label>
            </Button>
            <Button
              className="flex-1"
              isDisabled={isActionDisabled}
              onPress={shareImage}
              variant="outline"
            >
              <SymbolView
                name={{
                  android: "share",
                  ios: "square.and.arrow.up",
                  web: "share",
                }}
                size={18}
              />
              <Button.Label>{isSharing ? "共有中" : "共有"}</Button.Label>
            </Button>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
};
