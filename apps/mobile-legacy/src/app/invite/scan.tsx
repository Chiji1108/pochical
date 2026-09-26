import {
  type BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Button, Typography, useThemeColor } from "heroui-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppHeader } from "@/components/navigation/app-header";
import { getInviteCodeFromInviteUrl } from "@/lib/invite-links";

const INVALID_CODE_RESET_MS = 1800;

export default function InviteScanScreen() {
  const router = useRouter();
  const accentForegroundColor = useThemeColor("accent-foreground");
  const [permission, requestPermission] = useCameraPermissions();
  const scannedInviteCodeRef = useRef("");
  const [scannedInviteCode, setScannedInviteCode] = useState("");
  const [invalidCodeMessage, setInvalidCodeMessage] = useState("");

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/group");
  }, [router]);

  useEffect(() => {
    if (!invalidCodeMessage) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setInvalidCodeMessage("");
    }, INVALID_CODE_RESET_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [invalidCodeMessage]);

  const handleBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (scannedInviteCodeRef.current || invalidCodeMessage) {
        return;
      }

      const inviteCode = getInviteCodeFromInviteUrl(data);

      if (!inviteCode) {
        setInvalidCodeMessage("グループの招待QRコードではありません");
        return;
      }

      scannedInviteCodeRef.current = inviteCode;
      setScannedInviteCode(inviteCode);
      router.replace(`/invite/${encodeURIComponent(inviteCode)}`);
    },
    [invalidCodeMessage, router]
  );

  let content = (
    <View className="flex-1 items-center justify-center px-6">
      <Typography color="muted">カメラの準備をしています</Typography>
    </View>
  );

  if (permission?.granted) {
    content = (
      <View className="flex-1 bg-black">
        <CameraView
          active={!scannedInviteCode}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          facing="back"
          onBarcodeScanned={handleBarcodeScanned}
          style={StyleSheet.absoluteFill}
        />
        <View className="absolute inset-0 justify-center px-8">
          <View className="aspect-square w-full rounded-2xl border-2 border-white/90" />
        </View>
        <View className="absolute right-0 bottom-10 left-0 items-center px-6">
          <View className="rounded-lg bg-black/65 px-4 py-3">
            <Typography className="text-center text-white">
              招待QRコードを枠内に合わせてください
            </Typography>
            {invalidCodeMessage ? (
              <Typography className="mt-2 text-center text-danger">
                {invalidCodeMessage}
              </Typography>
            ) : null}
          </View>
        </View>
      </View>
    );
  } else if (permission && !permission.granted) {
    content = (
      <View className="flex-1 justify-center gap-5 px-6">
        <View className="gap-2">
          <Typography className="font-bold text-2xl">
            カメラを使用します
          </Typography>
          <Typography className="text-base" color="muted">
            招待QRコードを読み取るにはカメラへのアクセスが必要です
          </Typography>
        </View>
        <Button
          accessibilityLabel="カメラへのアクセスを許可"
          isDisabled={!permission.canAskAgain}
          onPress={requestPermission}
          size="md"
          variant="primary"
        >
          <SymbolView
            name={{
              android: "photo_camera",
              ios: "camera",
              web: "photo_camera",
            }}
            size={18}
            tintColor={accentForegroundColor}
          />
          <Button.Label>
            {permission.canAskAgain ? "カメラを許可" : "カメラを許可できません"}
          </Button.Label>
        </Button>
        {permission.canAskAgain ? null : (
          <Typography className="text-sm" color="muted">
            端末の設定からカメラのアクセスを許可してください
          </Typography>
        )}
      </View>
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
        title="招待QRコード"
      />
      <View className="flex-1">{content}</View>
    </View>
  );
}
