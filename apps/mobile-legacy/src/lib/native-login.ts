import { Platform } from "react-native";

export const usesNativeLogin = (provider: "apple" | "google") =>
  Platform.OS === "ios" || (Platform.OS === "android" && provider === "google");

export const getNativeIdentityToken = async (
  provider: "apple" | "google",
  nonce: string
): Promise<string | null> => {
  if (provider === "apple") {
    const apple = await import("expo-apple-authentication");
    if (!(await apple.isAvailableAsync())) {
      throw new Error("この端末ではAppleログインを利用できません。");
    }
    try {
      const credential = await apple.signInAsync({
        requestedScopes: [apple.AppleAuthenticationScope.EMAIL],
        nonce,
      });
      if (!credential.identityToken) {
        throw new Error("Appleの認証情報を取得できませんでした。");
      }
      return credential.identityToken;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ERR_REQUEST_CANCELED"
      ) {
        return null;
      }
      throw error;
    }
  }
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!webClientId || (Platform.OS === "ios" && !iosClientId)) {
    throw new Error("Googleログインの設定がまだ完了していません。");
  }
  const google = await import("react-native-nitro-google-signin");
  google.GoogleOneTapSignIn.configure({ webClientId, iosClientId, nonce });
  await google.GoogleOneTapSignIn.checkPlayServices();
  // iOS silent restore can return an old token without this attempt's nonce.
  let result =
    Platform.OS === "ios"
      ? await google.GoogleOneTapSignIn.createAccount()
      : await google.GoogleOneTapSignIn.signIn();
  if (google.isNoSavedCredentialFoundResponse(result)) {
    result = await google.GoogleOneTapSignIn.createAccount();
  }
  if (google.isNoSavedCredentialFoundResponse(result)) {
    result = await google.GoogleOneTapSignIn.presentExplicitSignIn();
  }
  if (google.isCancelledResponse(result)) {
    return null;
  }
  if (!(google.isSuccessResponse(result) && result.data.idToken)) {
    throw new Error("Googleの認証情報を取得できませんでした。");
  }
  return result.data.idToken;
};
