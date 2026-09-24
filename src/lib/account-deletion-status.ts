import { createMMKV } from "react-native-mmkv";

// A random receipt contains no account/profile data and survives local cleanup.
export const deletionStatusStorage = createMMKV({
  id: "account-deletion-status",
});
export const saveDeletionReceipt = (receipt: string) =>
  deletionStatusStorage.set("receipt", receipt);
