import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useConvex, useQuery } from "convex/react";
import { ListGroup, PressableFeedback } from "heroui-native";
import { useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import { saveDeletionReceipt } from "@/lib/account-deletion-status";
import { savePendingLogin } from "@/lib/account-link";
import { authenticateAccount } from "@/lib/account-login";
import { api } from "../../convex/_generated/api";

export const AccountDeletionSetting = () => {
  const current = useQuery(api.accounts.current);
  const requestDeletion = useAction(api.deleteAccount.request);
  const client = useConvex();
  const { signIn } = useAuthActions();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const remove = async () => {
    if (!current || running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    try {
      let appleAuthorizationCode: string | undefined;
      if (current.providers.includes("apple")) {
        if (Platform.OS === "ios") {
          appleAuthorizationCode = await getAppleDeletionCode();
        } else if (!current.canRevokeApple) {
          await savePendingLogin({ provider: "apple" });
          await authenticateAccount("apple", signIn, client);
          Alert.alert(
            "アカウントを確認してください",
            "ログイン中のアカウントを確認してから、もう一度アカウント削除を選んでください。"
          );
          return;
        }
      }
      const receipt = await requestDeletion({ appleAuthorizationCode });
      saveDeletionReceipt(receipt);
      Alert.alert(
        "削除を受け付けました",
        "端末のデータを消去してログアウトします。サーバー上の削除はバックグラウンドで進みます。"
      );
    } catch (error) {
      if (isAppleCancellation(error)) {
        return;
      }
      Alert.alert(
        "削除できませんでした",
        error instanceof Error
          ? error.message
          : "通信状態を確認して、もう一度お試しください"
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const confirm = () =>
    Alert.alert(
      "アカウントを削除しますか？",
      "カレンダー、アカウント情報、端末内の保存データを削除し、すべてのグループから脱退します。未同期のデータも失われます。\n\n共有チャットは自分の本文・名前・返信の引用を消し、削除済みの表示だけ残します。削除はバックグラウンドで進み、取り消せません。",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "アカウントを削除",
          style: "destructive",
          onPress: remove,
        },
      ]
    );
  return (
    <PressableFeedback
      animation={false}
      isDisabled={busy || !current}
      onPress={confirm}
    >
      <PressableFeedback.Scale>
        <ListGroup.Item disabled={busy || !current}>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle className="text-danger">
              {busy ? "削除を受け付けています…" : "アカウントを削除"}
            </ListGroup.ItemTitle>
            <ListGroup.ItemDescription>
              アカウントと関連データを削除します。この操作は取り消せません
            </ListGroup.ItemDescription>
          </ListGroup.ItemContent>
        </ListGroup.Item>
      </PressableFeedback.Scale>
      <PressableFeedback.Ripple />
    </PressableFeedback>
  );
};

const isAppleCancellation = (error: unknown) =>
  error &&
  typeof error === "object" &&
  "code" in error &&
  error.code === "ERR_REQUEST_CANCELED";
const getAppleDeletionCode = async () => {
  const apple = await import("expo-apple-authentication");
  const credential = await apple.signInAsync({ requestedScopes: [] });
  if (!credential.authorizationCode) {
    throw new Error("Appleの本人確認を完了できませんでした");
  }
  return credential.authorizationCode;
};
