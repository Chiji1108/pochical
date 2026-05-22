import { init } from "@instantdb/react-native";
import MMKVStore from "@instantdb/react-native-mmkv";
import schema from "../../instant.schema";

const appId = process.env.EXPO_PUBLIC_INSTANT_APP_ID;

if (!appId) {
  throw new Error("EXPO_PUBLIC_INSTANT_APP_ID を設定してください");
}

export const db = init({
  appId,
  schema,
  Store: MMKVStore,
});
