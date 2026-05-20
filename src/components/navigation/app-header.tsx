import { BlurView } from "expo-blur";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Button, type ButtonRootProps, Text } from "heroui-native";
import type { FC } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/utils";

export type AppHeaderAction = {
  accessibilityLabel: string;
  icon?: SymbolViewProps["name"];
  isDisabled?: boolean;
  label?: string;
  labelClassName?: string;
  onPress: () => void;
  variant?: ButtonRootProps["variant"];
};

type AppHeaderProps = {
  leftAction?: AppHeaderAction;
  rightAction?: AppHeaderAction;
  rightActions?: AppHeaderAction[];
  title: string;
};

type HeaderActionButtonProps = {
  action?: AppHeaderAction;
};

const HeaderActionButton: FC<HeaderActionButtonProps> = ({ action }) => (
  <View>
    {action ? (
      <Button
        accessibilityLabel={action.accessibilityLabel}
        className={cn(action.label ? "px-3" : "h-10 w-10")}
        isDisabled={action.isDisabled}
        isIconOnly={!action.label}
        onPress={action.onPress}
        size="sm"
        variant={action.variant ?? "ghost"}
      >
        {action.icon ? <SymbolView name={action.icon} size={18} /> : null}
        {action.label ? (
          <Button.Label className={action.labelClassName}>
            {action.label}
          </Button.Label>
        ) : null}
      </Button>
    ) : null}
  </View>
);

export const AppHeader: FC<AppHeaderProps> = ({
  leftAction,
  rightAction,
  rightActions,
  title,
}) => {
  const insets = useSafeAreaInsets();
  const resolvedRightActions =
    rightActions ?? (rightAction ? [rightAction] : []);

  return (
    <BlurView
      blurMethod="dimezisBlurViewSdk31Plus"
      className="border-border/60 border-b bg-background/95"
      intensity={30}
      style={{ paddingTop: insets.top }}
      tint="systemThinMaterial"
    >
      <View className="h-14 flex-row items-center px-3">
        <View className="min-w-20 flex-1 items-start">
          <HeaderActionButton action={leftAction} />
        </View>
        <Text
          className="min-w-0 px-3 text-center font-bold text-lg"
          numberOfLines={1}
        >
          {title}
        </Text>
        <View className="min-w-20 flex-1 flex-row justify-end gap-1">
          {resolvedRightActions.map((action) => (
            <HeaderActionButton
              action={action}
              key={action.accessibilityLabel}
            />
          ))}
        </View>
      </View>
    </BlurView>
  );
};
