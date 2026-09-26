import { useAuthActions } from "@convex-dev/auth/react";
import { useConvex, useMutation, useQuery } from "convex/react";
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from "expo-crypto";
import { BottomSheet, ListGroup, PressableFeedback } from "heroui-native";
import { useState } from "react";
import { Alert, View } from "react-native";
import { savePendingLogin } from "@/lib/account-link";
import { authenticateAccount } from "@/lib/account-login";
import { useAccountSignOut } from "@/lib/account-session";
import { showLoginError } from "@/lib/login-error";
import { api } from "../../convex/_generated/api";
import { AccountProviderButton } from "./account-provider-button";

export const AccountSettings = () => {
  const current = useQuery(api.accounts.current);
  const { signIn } = useAuthActions();
  const signOut = useAccountSignOut();
  const prepareLink = useMutation(api.accounts.prepareLink);
  const client = useConvex();
  const [isLoginOpen, setLoginOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const authenticate = async (provider: "apple" | "google") => {
    if (busy) {
      return;
    }
    setBusy(true);
    setLoginOpen(false);
    try {
      const secret = `${randomUUID()}${randomUUID()}`;
      if (secret) {
        await prepareLink({
          tokenHash: await digestStringAsync(
            CryptoDigestAlgorithm.SHA256,
            secret
          ),
        });
      }
      await savePendingLogin({ provider, secret });
      await authenticateAccount(provider, signIn, client);
    } catch {
      showLoginError();
    } finally {
      setBusy(false);
    }
  };
  const isLinked = !!current && !current.isAnonymous;
  const isDisabled = busy || !current;
  let label = "アカウントを確認中…";
  if (current) {
    label = isLinked ? "ログアウト" : "ログイン";
  }
  if (busy) {
    label = "ログイン中…";
  }
  const onAccountPress = () => {
    if (!isLinked) {
      setLoginOpen(true);
      return;
    }
    Alert.alert(
      "ログアウトしますか？",
      "再ログインするとデータを復元できます。",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "ログアウト",
          onPress: async () => {
            try {
              await signOut();
            } catch (error) {
              Alert.alert(
                "ログアウトできませんでした",
                error instanceof Error
                  ? error.message
                  : "もう一度お試しください"
              );
            }
          },
        },
      ]
    );
  };
  return (
    <>
      <ListGroup>
        <PressableFeedback
          animation={false}
          isDisabled={isDisabled}
          onPress={onAccountPress}
        >
          <PressableFeedback.Scale>
            <ListGroup.Item disabled={isDisabled}>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle
                  className={isLinked ? "text-danger" : undefined}
                >
                  {label}
                </ListGroup.ItemTitle>
                <ListGroup.ItemDescription>
                  {isLinked
                    ? "この端末からログアウトします。再ログインすると同じデータを利用できます。"
                    : "ログインすると、機種変更後も複数の端末でも、同じデータを使えます。"}
                </ListGroup.ItemDescription>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix />
            </ListGroup.Item>
          </PressableFeedback.Scale>
          <PressableFeedback.Ripple />
        </PressableFeedback>
      </ListGroup>
      <BottomSheet
        isOpen={isLoginOpen && !!current?.isAnonymous}
        onOpenChange={setLoginOpen}
      >
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content>
            <BottomSheet.Close accessibilityLabel="閉じる" variant="ghost" />
            <View className="mb-6 gap-2">
              <BottomSheet.Title>ログイン</BottomSheet.Title>
              <BottomSheet.Description>
                登録済みの場合は、そのアカウントのデータを開きます。
              </BottomSheet.Description>
            </View>
            <View className="gap-3 pb-4">
              <AccountProviderButton
                disabled={busy || !current}
                label="Appleで続ける"
                onPress={() => authenticate("apple")}
                provider="apple"
              />
              <AccountProviderButton
                disabled={busy || !current}
                label="Googleで続ける"
                onPress={() => authenticate("google")}
                provider="google"
              />
            </View>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
};
