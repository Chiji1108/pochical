import { createMMKV } from "react-native-mmkv";

// Keep the existing calendar store ID so local and unsent work survives upgrades.
export const createAccountStorage = (namespace: string, ownerId: string) =>
  createMMKV({ id: `${namespace}-${ownerId}` });
