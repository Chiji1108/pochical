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
  includeTopInset?: boolean;
  leftAction?: AppHeaderAction;
  rightAction?: AppHeaderAction;
  rightActions?: AppHeaderAction[];
  title: string;
  titleAlign?: "center" | "left";
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
  includeTopInset = true,
  leftAction,
  rightAction,
  rightActions,
  title,
  titleAlign = "center",
}) => {
  const insets = useSafeAreaInsets();
  const resolvedRightActions =
    rightActions ?? (rightAction ? [rightAction] : []);
  const isLeftAligned = titleAlign === "left";

  return (
    <View
      className="border-border/60 border-b bg-background"
      style={{ paddingTop: includeTopInset ? insets.top : 0 }}
    >
      <View className="h-14 flex-row items-center px-3">
        <View
          className={cn(
            isLeftAligned ? "items-start" : "min-w-20 flex-1 items-start"
          )}
        >
          <HeaderActionButton action={leftAction} />
        </View>
        <Text
          className={cn(
            "min-w-0 px-3 font-bold text-lg",
            isLeftAligned ? "flex-1 text-left" : "text-center"
          )}
          numberOfLines={1}
        >
          {title}
        </Text>
        <View
          className={cn(
            "flex-row justify-end gap-1",
            isLeftAligned ? undefined : "min-w-20 flex-1"
          )}
        >
          {resolvedRightActions.map((action) => (
            <HeaderActionButton
              action={action}
              key={action.accessibilityLabel}
            />
          ))}
        </View>
      </View>
    </View>
  );
};
