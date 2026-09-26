import { DatePickerDialog, Host } from "@expo/ui/jetpack-compose";
import type { ButtonSize, ButtonVariant } from "heroui-native/button";
import { Button } from "heroui-native/button";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import { Platform } from "react-native";
import { NativeDatePicker } from "./native-date-picker";

type CalendarDatePickerButtonProps = {
  accessibilityLabel?: string;
  children: ReactNode;
  className?: string;
  isDisabled?: boolean;
  onSelectDate: (date: Date) => void;
  size?: ButtonSize;
  value: Date;
  variant?: ButtonVariant;
};

export const CalendarDatePickerButton: FC<CalendarDatePickerButtonProps> = ({
  children,
  onSelectDate,
  value,
  ...buttonProps
}) => {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const openDatePicker = () => {
    setIsDatePickerOpen(true);
  };

  const selectDateFromPicker = (selectedPickerDate: Date) => {
    onSelectDate(selectedPickerDate);
  };

  const selectDateFromDialog = (selectedPickerDate: Date) => {
    onSelectDate(selectedPickerDate);
    setIsDatePickerOpen(false);
  };

  return (
    <>
      <Button onPress={openDatePicker} {...buttonProps}>
        {children}
      </Button>
      {Platform.OS === "android" && isDatePickerOpen ? (
        <Host matchContents>
          <DatePickerDialog
            confirmButtonLabel="完了"
            dismissButtonLabel="キャンセル"
            initialDate={value.toISOString()}
            onDateSelected={selectDateFromDialog}
            onDismissRequest={() => {
              setIsDatePickerOpen(false);
            }}
            variant="picker"
          />
        </Host>
      ) : null}
      {Platform.OS === "android" ? null : (
        <NativeDatePicker
          isPresented={isDatePickerOpen}
          onDateChange={selectDateFromPicker}
          onIsPresentedChange={setIsDatePickerOpen}
          value={value}
        />
      )}
    </>
  );
};
