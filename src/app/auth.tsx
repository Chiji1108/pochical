import { useAuthActions } from "@convex-dev/auth/react";
import { useConvex } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { finishLogin } from "@/lib/account-link";

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { signIn } = useAuthActions();
  const client = useConvex();
  const router = useRouter();
  useEffect(() => {
    if (!code) {
      router.replace("/(tabs)/settings");
      return;
    }
    finishLogin(code, signIn, client)
      .catch((error: unknown) => {
        Alert.alert(
          "ログイン",
          error instanceof Error ? error.message : "ログインに失敗しました"
        );
      })
      .finally(() => router.replace("/(tabs)/settings"));
  }, [client, code, router, signIn]);
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator />
    </View>
  );
}
