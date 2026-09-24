import { deleteItemAsync } from "expo-secure-store";
import { createMMKV } from "react-native-mmkv";
import { cancelPendingLogin } from "./account-link";
import { createAccountStorage } from "./account-storage";
import { stopWorkSync } from "./work-data";

export const clearDeletedAccountData = async (
  ownerId: string,
  subject: string
) => {
  // Stop in-flight writers before invalidating and erasing persistent state.
  stopWorkSync();
  createAccountStorage("work", ownerId).clearAll();
  createAccountStorage("query", "display").clearAll();
  const identities = createMMKV({ id: "convex-identity" });
  for (const key of identities.getAllKeys()) {
    if (key === subject || identities.getString(key) === ownerId) {
      identities.remove(key);
    }
  }
  await Promise.all([
    cancelPendingLogin(),
    deleteItemAsync("pochical-selected-group-id"),
    deleteItemAsync("pochical-app-settings"),
  ]);
};
