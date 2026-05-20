import { SymbolView } from "expo-symbols";
import { BottomSheet, Button } from "heroui-native";
import { View } from "react-native";

type CalendarSaveActionsSheetProps = {
  description: string;
  isCalendarExportDisabled?: boolean;
  isOpen: boolean;
  isTertiaryActionVisible?: boolean;
  onAddToDeviceCalendar: () => void;
  onChangeOpen: (isOpen: boolean) => void;
  onSaveAsImage: () => void;
  title: string;
};

export const CalendarSaveActionsSheet = ({
  description,
  isCalendarExportDisabled,
  isOpen,
  isTertiaryActionVisible,
  onAddToDeviceCalendar,
  onChangeOpen,
  onSaveAsImage,
  title,
}: CalendarSaveActionsSheetProps) => (
  <BottomSheet isOpen={isOpen} onOpenChange={onChangeOpen}>
    <BottomSheet.Portal>
      <BottomSheet.Overlay />
      <BottomSheet.Content>
        <BottomSheet.Close variant="ghost" />
        <View className="mb-6 gap-2">
          <BottomSheet.Title>{title}</BottomSheet.Title>
          <BottomSheet.Description>{description}</BottomSheet.Description>
        </View>
        <View className="gap-3">
          <Button
            onPress={() => {
              onChangeOpen(false);
              onSaveAsImage();
            }}
            variant="primary"
          >
            <SymbolView
              name={{
                android: "image",
                ios: "photo",
                web: "image",
              }}
              size={18}
              tintColor="white"
            />
            <Button.Label>画像で保存</Button.Label>
          </Button>
          <Button
            isDisabled={isCalendarExportDisabled}
            onPress={() => {
              onChangeOpen(false);
              onAddToDeviceCalendar();
            }}
            variant="outline"
          >
            <SymbolView
              name={{
                android: "calendar_add_on",
                ios: "calendar.badge.plus",
                web: "calendar_add_on",
              }}
              size={18}
            />
            <Button.Label>端末カレンダーに追加</Button.Label>
          </Button>
          {isTertiaryActionVisible ? (
            <Button
              onPress={() => {
                onChangeOpen(false);
              }}
              variant="tertiary"
            >
              <Button.Label>あとで</Button.Label>
            </Button>
          ) : null}
        </View>
      </BottomSheet.Content>
    </BottomSheet.Portal>
  </BottomSheet>
);
