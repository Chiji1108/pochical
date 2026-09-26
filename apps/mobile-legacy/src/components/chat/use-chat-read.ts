import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { AppState } from "react-native";

// A mounted screen can be behind another route or in the background.
export const useChatRead = (
  enabled: boolean,
  latestMessageId: string | undefined,
  markRead: () => Promise<void>
) => {
  useFocusEffect(
    useCallback(() => {
      if (!(enabled && latestMessageId)) {
        return;
      }
      const markIfActive = () => {
        if (AppState.currentState === "active") {
          markRead().catch(() => undefined);
        }
      };
      markIfActive();
      const subscription = AppState.addEventListener("change", markIfActive);
      return () => subscription.remove();
    }, [enabled, latestMessageId, markRead])
  );
};
