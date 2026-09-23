import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import { Platform } from "react-native";
export const authStorage = {
  getItem: (key: string) =>
    Platform.OS === "web"
      ? Promise.resolve(localStorage.getItem(key))
      : getItemAsync(key),
  setItem: (key: string, value: string) =>
    Platform.OS === "web"
      ? Promise.resolve(localStorage.setItem(key, value))
      : setItemAsync(key, value),
  removeItem: (key: string) =>
    Platform.OS === "web"
      ? Promise.resolve(localStorage.removeItem(key))
      : deleteItemAsync(key),
};
