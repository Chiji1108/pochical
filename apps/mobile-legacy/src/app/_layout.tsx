import { publishAuthToken } from "@/lib/auth-token";
import "react-native-get-random-values";
import "@/global.css";

import {
  ConvexAuthProvider,
  useAuthActions,
  useAuthToken,
  useConvexAuth,
} from "@convex-dev/auth/react";
import { ConvexReactClient, useQuery } from "convex/react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { HeroUINativeProvider } from "heroui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { createMMKV, useMMKVString } from "react-native-mmkv";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionLoadingScreen } from "@/components/session-loading-screen";
import { clearDeletedAccountData } from "@/lib/account-cleanup";
import { deletionStatusStorage } from "@/lib/account-deletion-status";
import { AccountSignOutContext } from "@/lib/account-session";
import { AppSettingsProvider } from "@/lib/app-settings";
import { authStorage } from "@/lib/auth-storage";
import { QueryCacheProvider } from "@/lib/cached-query";
import { WorkDataProvider } from "@/lib/work-data";
import { api } from "../../convex/_generated/api";

export default function RootLayout() {
  return <RootLayoutContent />;
}

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
  const convexClient = useMemo(() => {
    if (!convexUrl) {
      return null;
    }

    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);

  if (!convexClient) {
    throw new Error("EXPO_PUBLIC_CONVEX_URL を設定してください");
  }

  return (
    <ConvexAuthProvider
      client={convexClient}
      shouldHandleCode={false}
      storage={authStorage}
    >
      <AuthGate colorScheme={colorScheme} />
    </ConvexAuthProvider>
  );
}

function AppShell({
  colorScheme,
}: {
  colorScheme: ReturnType<typeof useColorScheme>;
}) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <HeroUINativeProvider
            config={{ devInfo: { stylingPrinciples: false } }}
          >
            <AppSettingsProvider>
              <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="patterns"
                  options={{ presentation: "fullScreenModal" }}
                />
                <Stack.Screen
                  name="members"
                  options={{ presentation: "fullScreenModal" }}
                />
                <Stack.Screen
                  name="export"
                  options={{ presentation: "fullScreenModal" }}
                />
                <Stack.Screen name="share-groups/new" />
                <Stack.Screen name="share-groups/[groupId]/chats/group/index" />
                <Stack.Screen name="share-groups/[groupId]/chats/[memberUserId]/index" />
                <Stack.Screen name="share-groups/[groupId]/settings" />
                <Stack.Screen name="share-groups/[groupId]/shifts" />
                <Stack.Screen name="invite/scan" />
                <Stack.Screen name="invite/[inviteCode]" />
              </Stack>
            </AppSettingsProvider>
          </HeroUINativeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const identityStorage = createMMKV({ id: "convex-identity" });
function AuthGate({
  colorScheme,
}: {
  colorScheme: ReturnType<typeof useColorScheme>;
}) {
  const [receipt, setReceipt] = useMMKVString("receipt", deletionStatusStorage);
  const deletionPending = useQuery(
    api.accountDeletion.pending,
    receipt ? { receipt } : "skip"
  );
  useEffect(() => {
    if (receipt && deletionPending === false) {
      setReceipt(undefined);
      Alert.alert(
        "アカウントの削除が完了しました",
        "サーバー上のアカウントと関連データを削除しました。"
      );
    }
  }, [receipt, deletionPending, setReceipt]);
  const { isLoading, isAuthenticated } = useConvexAuth();
  const token = useAuthToken();
  useEffect(() => {
    publishAuthToken(token);
  }, [token]);
  const { signIn, signOut } = useAuthActions();
  const [signingOut, setSigningOut] = useState(false);
  const signOutWithProgress = useCallback(async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }, [signOut]);
  const [clearing, setClearing] = useState(false);
  const [cleanupError, setCleanupError] = useState(false);
  const [cleanupRequested, setCleanupRequested] = useState(true);
  const cleanupOwner = useRef<string | undefined>(undefined);
  const cleanupRunning = useRef(false);
  const current = useQuery(api.accounts.current, isAuthenticated ? {} : "skip");
  const signingIn = useRef(false);
  const [error, setError] = useState<Error>();
  // The cache is bound to the signed-in subject, never reused for a different account.
  const subject = useMemo(() => {
    if (!token) {
      return;
    }
    try {
      return (
        JSON.parse(
          atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
        ) as { sub: string }
      ).sub.split("|")[0];
    } catch {
      return;
    }
  }, [token]);
  const matchingCurrent = current?.authUserId === subject ? current : undefined;
  const cachedId = subject ? identityStorage.getString(subject) : undefined;
  useEffect(() => {
    if (matchingCurrent && !matchingCurrent.deletionPending && subject) {
      identityStorage.set(subject, matchingCurrent.userId);
    }
  }, [matchingCurrent, subject]);
  const deletionDetected =
    !!matchingCurrent?.deletionPending || (isAuthenticated && current === null);
  useEffect(() => {
    if (!cleanupRequested) {
      return;
    }
    const ownerId = matchingCurrent?.userId ?? cachedId ?? cleanupOwner.current;
    cleanupOwner.current = ownerId;
    if (!(deletionDetected && subject) || cleanupRunning.current) {
      return;
    }
    cleanupRunning.current = true;
    setClearing(true);
    setCleanupError(false);
    const cleanup = async () => {
      try {
        if (ownerId) {
          await clearDeletedAccountData(ownerId, subject);
        }
        await signOutWithProgress();
        setClearing(false);
      } catch {
        setCleanupRequested(false);
        setCleanupError(true);
      } finally {
        cleanupRunning.current = false;
      }
    };
    cleanup().catch(() => setCleanupError(true));
  }, [
    deletionDetected,
    subject,
    matchingCurrent?.userId,
    cachedId,
    signOutWithProgress,
    cleanupRequested,
  ]);
  useEffect(() => {
    if (isAuthenticated) {
      signingIn.current = false;
    }
    if (
      clearing ||
      signingOut ||
      deletionDetected ||
      isLoading ||
      isAuthenticated ||
      token ||
      signingIn.current
    ) {
      return;
    }
    signingIn.current = true;
    signIn("anonymous").catch((reason: unknown) => {
      signingIn.current = false;
      setError(
        reason instanceof Error
          ? reason
          : new Error("匿名ログインに失敗しました")
      );
    });
  }, [
    clearing,
    signingOut,
    deletionDetected,
    isLoading,
    isAuthenticated,
    signIn,
    token,
  ]);
  if (error) {
    throw error;
  }
  if (signingOut) {
    return <SessionLoadingScreen message="ログアウトしています…" />;
  }
  if (clearing || deletionDetected) {
    return (
      <SessionLoadingScreen
        message={
          cleanupError
            ? "端末データの消去を完了できませんでした"
            : "端末のデータを消去しています…"
        }
        onRetry={cleanupError ? () => setCleanupRequested(true) : undefined}
      />
    );
  }
  const userId = matchingCurrent?.userId ?? (token ? cachedId : undefined);
  if (!userId) {
    return <SessionLoadingScreen message="準備しています…" />;
  }
  return (
    <AccountSignOutContext value={signOutWithProgress}>
      <WorkDataProvider key={userId} userId={userId}>
        <QueryCacheProvider
          key={subject}
          owner={`${process.env.EXPO_PUBLIC_CONVEX_URL}:${subject}:${userId}`}
        >
          <AppShell colorScheme={colorScheme} />
        </QueryCacheProvider>
      </WorkDataProvider>
    </AccountSignOutContext>
  );
}
