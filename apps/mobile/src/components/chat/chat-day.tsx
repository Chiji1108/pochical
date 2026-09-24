import { type DayProps, useTheme } from "@kesha-antonov/react-native-chat";
import { Text, View } from "react-native";
import { formatChatDate } from "./chat-date";

const ChatDay = ({ createdAt, textProps, isAnimated }: DayProps) => {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          alignItems: "center",
          marginTop: isAnimated ? 0 : 8,
          marginBottom: isAnimated ? 0 : 12,
        },
      ]}
    >
      <View
        style={[
          {
            backgroundColor: theme.colors.dayPillBackground,
            paddingVertical: 5,
            paddingHorizontal: 12,
            borderRadius: theme.radii.dayPill,
          },
        ]}
      >
        <Text
          {...textProps}
          style={[
            {
              color: theme.colors.dayPillText,
              fontSize: theme.typography.day.fontSize,
              fontWeight: theme.typography.day.fontWeight,
              letterSpacing: 0.2,
            },
            textProps?.style,
          ]}
        >
          {formatChatDate(createdAt)}
        </Text>
      </View>
    </View>
  );
};

// The library calls this function directly inside useMemo.
export const renderChatDay = (props: DayProps) => <ChatDay {...props} />;
