import { CloseButton } from "heroui-native";

type EmojiPopupCloseButtonProps = {
  close: () => void;
};

export const EmojiPopupCloseButton = ({
  close,
}: EmojiPopupCloseButtonProps) => (
  <CloseButton
    accessibilityLabel="絵文字ピッカーを閉じる"
    className="self-center"
    onPress={close}
  />
);
