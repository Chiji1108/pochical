import {
  ImpactFeedbackStyle,
  impactAsync,
  NotificationFeedbackType,
  notificationAsync,
  selectionAsync,
} from "expo-haptics";

export const playSelectionHaptic = () => {
  selectionAsync().catch(() => {
    // Haptics can be unavailable depending on the device or platform.
  });
};

export const playLightImpactHaptic = () => {
  impactAsync(ImpactFeedbackStyle.Light).catch(() => {
    // Haptics can be unavailable depending on the device or platform.
  });
};

export const playWarningHaptic = () => {
  notificationAsync(NotificationFeedbackType.Warning).catch(() => {
    // Haptics can be unavailable depending on the device or platform.
  });
};
