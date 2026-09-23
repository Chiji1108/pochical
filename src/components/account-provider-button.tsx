import { Image } from "expo-image";
import { Button } from "heroui-native";

export type AccountProviderButtonProps = {
  disabled: boolean;
  label: string;
  onPress: () => void;
  provider: "apple" | "google";
};

export const AccountProviderButton = ({
  provider,
  label,
  disabled,
  onPress,
}: AccountProviderButtonProps) => (
  <Button
    accessibilityLabel={label}
    className="h-12 w-full gap-3 rounded-xl border border-[#747775] bg-white"
    isDisabled={disabled}
    onPress={onPress}
    variant="outline"
  >
    <Image
      accessible={false}
      contentFit="contain"
      source={
        provider === "apple"
          ? require("../../assets/images/auth/apple.svg")
          : require("../../assets/images/auth/google.png")
      }
      style={{ width: 20, height: 20 }}
    />
    <Button.Label className="font-medium text-[#1f1f1f] text-base">
      {label}
    </Button.Label>
  </Button>
);
