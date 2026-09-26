import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Button,
  Text,
  useColorScheme,
  View,
} from "react-native";

export const SessionLoadingScreen = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) => {
  const colorScheme = useColorScheme();
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      {onRetry ? null : (
        <ActivityIndicator
          accessibilityLabel={message}
          color={colorScheme === "dark" ? "#a1a1aa" : "#71717a"}
          size="small"
        />
      )}
      <Text
        accessibilityLiveRegion="polite"
        className="text-center text-foreground"
      >
        {message}
      </Text>
      {onRetry ? <Button onPress={onRetry} title="再試行" /> : null}
    </View>
  );
};
