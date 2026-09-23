import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const clientSuffix = ".apps.googleusercontent.com";
  if (iosClientId && !iosClientId.endsWith(clientSuffix)) {
    throw new Error(
      "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must be an iOS OAuth client ID"
    );
  }
  return {
    ...config,
    name: config.name ?? "ポチカレ",
    slug: config.slug ?? "pochical",
    ios: { ...config.ios, usesAppleSignIn: true },
    plugins: [
      ...(config.plugins ?? []),
      "expo-apple-authentication",
      ["./plugins/with-native-auth.cjs", { configurePods: !iosClientId }],
      // The plugin requires a real iOS client ID. Add it after Google Cloud setup.
      ...(iosClientId
        ? [
            [
              "react-native-nitro-google-signin",
              {
                iosUrlScheme: `com.googleusercontent.apps.${iosClientId.slice(0, -clientSuffix.length)}`,
              },
            ] as [string, Record<string, string>],
          ]
        : []),
    ],
  };
};
