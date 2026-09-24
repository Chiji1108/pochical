import { Spinner, Typography } from "heroui-native";
import { View } from "react-native";

export const ShiftLoadingIndicator = () => (
  <View
    accessibilityLabel="シフトを読み込み中"
    accessibilityState={{ busy: true }}
    accessible
    className="flex-1 items-center justify-center gap-3"
  >
    <Spinner size="sm" />
    <Typography className="text-sm" color="muted">
      シフトを読み込み中
    </Typography>
  </View>
);
