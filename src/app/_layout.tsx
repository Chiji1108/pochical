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
import { useEffect, useMemo, useRef, useState } from "react";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { createMMKV } from "react-native-mmkv";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppSettingsProvider } from "@/lib/app-settings";
import { authStorage } from "@/lib/auth-storage";
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
  const { isLoading, isAuthenticated } = useConvexAuth();
  const token = useAuthToken();
  useEffect(() => {
    publishAuthToken(token);
  }, [token]);
  const { signIn } = useAuthActions();
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
    if (matchingCurrent && subject) {
      identityStorage.set(subject, matchingCurrent.userId);
    }
  }, [matchingCurrent, subject]);
  useEffect(() => {
    if (isAuthenticated) {
      signingIn.current = false;
    }
    if (isLoading || isAuthenticated || token || signingIn.current) {
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
  }, [isLoading, isAuthenticated, signIn, token]);
  if (error) {
    throw error;
  }
  const userId = matchingCurrent?.userId ?? (token ? cachedId : undefined);
  if (!userId) {
    return null;
  }
  return (
    <WorkDataProvider key={userId} userId={userId}>
      <AppShell colorScheme={colorScheme} />
    </WorkDataProvider>
  );
}
