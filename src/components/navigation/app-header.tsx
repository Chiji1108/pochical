import { BlurView } from "expo-blur";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import {
  Button,
  type ButtonRootProps,
  Text,
  useThemeColor,
} from "heroui-native";
import type { FC } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/utils";

type AppHeaderAction = {
  accessibilityLabel: string;
  icon?: SymbolViewProps["name"];
  isDisabled?: boolean;
  label?: string;
  onPress: () => void;
  variant?: ButtonRootProps["variant"];
};

type AppHeaderProps = {
  leftAction?: AppHeaderAction;
  rightAction?: AppHeaderAction;
  title: string;
};

type HeaderActionButtonProps = {
  action?: AppHeaderAction;
  align: "left" | "right";
};

const HeaderActionButton: FC<HeaderActionButtonProps> = ({ action, align }) => {
  const [accentForegroundColor, foregroundColor, mutedColor] = useThemeColor([
    "accent-foreground",
    "foreground",
    "muted",
  ]);
  const iconColor =
    action?.variant === "primary" ? accentForegroundColor : foregroundColor;

  return (
    <View
      className={cn(
        "min-w-20 flex-1",
        align === "right" ? "items-end" : "items-start"
      )}
    >
      {action ? (
        <Button
          accessibilityLabel={action.accessibilityLabel}
          className={cn(action.label ? "px-3" : "h-9 w-9")}
          isDisabled={action.isDisabled}
          isIconOnly={!action.label}
          onPress={action.onPress}
          size="sm"
          variant={action.variant ?? "ghost"}
        >
          {action.icon ? (
            <SymbolView
              name={action.icon}
              size={18}
              tintColor={action.isDisabled ? mutedColor : iconColor}
            />
          ) : null}
          {action.label ? (
            <Button.Label className="font-semibold">
              {action.label}
            </Button.Label>
          ) : null}
        </Button>
      ) : null}
    </View>
  );
};

export const AppHeader: FC<AppHeaderProps> = ({
  leftAction,
  rightAction,
  title,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <BlurView
      blurMethod="dimezisBlurViewSdk31Plus"
      className="border-border/60 border-b bg-background/95"
      intensity={30}
      style={{ paddingTop: insets.top }}
      tint="systemThinMaterial"
    >
      <View className="h-14 flex-row items-center px-3">
        <HeaderActionButton action={leftAction} align="left" />
        <Text
          className="min-w-0 px-3 text-center font-bold text-lg"
          numberOfLines={1}
        >
          {title}
        </Text>
        <HeaderActionButton action={rightAction} align="right" />
      </View>
    </BlurView>
  );
};
