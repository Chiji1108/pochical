import { Alert } from "react-native";

export const showLoginError = () => {
  Alert.alert(
    "ログインできませんでした",
    "通信環境や端末のアカウント設定を確認して、もう一度お試しください。"
  );
};
