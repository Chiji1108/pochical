import { Host, TimePickerDialog } from "@expo/ui/jetpack-compose";
import { format } from "date-fns";
import { Button } from "heroui-native/button";
import type { FC } from "react";
import { useState } from "react";
import { Platform } from "react-native";
import { NativeTimePicker } from "./native-time-picker";

type PatternTimePickerButtonProps = {
  onSelectDate: (date: Date) => void;
  value: Date;
};

export const PatternTimePickerButton: FC<PatternTimePickerButtonProps> = ({
  onSelectDate,
  value,
}) => {
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);

  const openTimePicker = () => {
    setIsTimePickerOpen(true);
  };

  const selectDateFromPicker = (selectedPickerDate: Date) => {
    onSelectDate(selectedPickerDate);
  };

  const selectDateFromDialog = (selectedPickerDate: Date) => {
    onSelectDate(selectedPickerDate);
    setIsTimePickerOpen(false);
  };

  return (
    <>
      <Button onPress={openTimePicker} size="sm" variant="outline">
        <Button.Label className="font-medium text-base">
          {format(value, "HH:mm")}
        </Button.Label>
      </Button>
      {Platform.OS === "android" && isTimePickerOpen ? (
        <Host matchContents>
          <TimePickerDialog
            confirmButtonLabel="完了"
            dismissButtonLabel="キャンセル"
            initialDate={value.toISOString()}
            is24Hour={true}
            onDateSelected={selectDateFromDialog}
            onDismissRequest={() => {
              setIsTimePickerOpen(false);
            }}
          />
        </Host>
      ) : null}
      {Platform.OS === "android" ? null : (
        <NativeTimePicker
          isPresented={isTimePickerOpen}
          onDateChange={selectDateFromPicker}
          onIsPresentedChange={setIsTimePickerOpen}
          value={value}
        />
      )}
    </>
  );
};
