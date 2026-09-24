import {
  BottomSheet,
  DatePicker,
  Host,
  RNHostView,
  VStack,
} from "@expo/ui/swift-ui";
import {
  datePickerStyle,
  environment,
  frame,
  presentationDetents,
  presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import { Button } from "heroui-native/button";
import type { FC } from "react";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

export type NativeDatePickerProps = {
  isPresented: boolean;
  onDateChange: (date: Date) => void;
  onIsPresentedChange: (isPresented: boolean) => void;
  value: Date;
};

const DATE_PICKER_LOCALE = "ja_JP";
const DATE_PICKER_HEIGHT = 216;
const DATE_PICKER_WIDTH = 360;
const SHEET_HEIGHT = 300;

export const NativeDatePicker: FC<NativeDatePickerProps> = ({
  isPresented,
  onDateChange,
  onIsPresentedChange,
  value,
}) => {
  const [draftDate, setDraftDate] = useState(value);

  useEffect(() => {
    if (isPresented) {
      setDraftDate(value);
    }
  }, [isPresented, value]);

  const cancelDateSelection = () => {
    setDraftDate(value);
    onIsPresentedChange(false);
  };

  const commitDateSelection = () => {
    onDateChange(draftDate);
    onIsPresentedChange(false);
  };

  return (
    <Host style={styles.host}>
      <BottomSheet
        isPresented={isPresented}
        onIsPresentedChange={onIsPresentedChange}
      >
        <VStack
          modifiers={[
            presentationDetents([{ height: SHEET_HEIGHT }]),
            presentationDragIndicator("visible"),
          ]}
          spacing={0}
        >
          <DatePicker
            displayedComponents={["date"]}
            modifiers={[
              datePickerStyle("wheel"),
              environment("locale", DATE_PICKER_LOCALE),
              frame({
                height: DATE_PICKER_HEIGHT,
                maxWidth: DATE_PICKER_WIDTH,
                minWidth: DATE_PICKER_WIDTH,
              }),
            ]}
            onDateChange={setDraftDate}
            selection={draftDate}
          />
          <RNHostView matchContents>
            <View style={styles.actions}>
              <Button
                onPress={cancelDateSelection}
                size="md"
                style={styles.actionButton}
                variant="ghost"
              >
                キャンセル
              </Button>
              <Button
                onPress={commitDateSelection}
                size="md"
                style={styles.actionButton}
                variant="primary"
              >
                完了
              </Button>
            </View>
          </RNHostView>
        </VStack>
      </BottomSheet>
    </Host>
  );
};

const styles = StyleSheet.create({
  actionButton: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
    width: DATE_PICKER_WIDTH,
  },
  host: {
    height: 1,
    position: "absolute",
    width: 1,
  },
});
