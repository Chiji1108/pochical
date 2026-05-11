import { DatePickerDialog, Host } from "@expo/ui/jetpack-compose";
import { isSameMonth, isToday } from "date-fns";
import { Button } from "heroui-native/button";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import { Platform, View } from "react-native";
import { AppText } from "@/components/app-text";
import { cn } from "@/lib/utils";
import { NativeDatePicker } from "./native-date-picker";
import { WeekRow } from "./week-row";

type CalendarHeaderProps = {
  onSelectDate: (date: Date) => void;
  onPressToday: () => void;
  selectedDate?: Date;
  yearMonth: Date;
  className?: string;
};

type CalendarHeaderContentProps = {
  canReturnToToday: boolean;
  className?: string;
  onPressMonth: () => void;
  onPressToday: () => void;
  yearMonth: Date;
};

const CalendarHeaderContent: FC<CalendarHeaderContentProps> = ({
  canReturnToToday,
  className,
  onPressMonth,
  onPressToday,
  yearMonth,
}) => (
  <View className={cn("flex flex-col gap-2 px-2 pt-4", className)}>
    <View className="flex flex-row items-center justify-between">
      <Button onPress={onPressMonth} variant="ghost">
        <Button.Label className="font-bold text-4xl leading-tight">
          {yearMonth.getMonth() + 1}
        </Button.Label>
      </Button>
      <Button
        isDisabled={!canReturnToToday}
        onPress={onPressToday}
        size="sm"
        variant="outline"
      >
        今日
      </Button>
    </View>
    <WeekRow>
      {(date) => (
        <AppText className="text-xs">
          {date.toLocaleDateString("ja-JP", {
            weekday: "short",
          })}
        </AppText>
      )}
    </WeekRow>
  </View>
);

export const CalendarHeader: FC<CalendarHeaderProps> = ({
  onSelectDate,
  onPressToday,
  selectedDate,
  yearMonth,
  className,
}) => {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const today = new Date();
  const canReturnToToday =
    !isSameMonth(yearMonth, today) ||
    (!!selectedDate && !isToday(selectedDate));
  const datePickerValue = selectedDate ?? yearMonth;

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

  let datePicker: ReactNode = null;

  if (Platform.OS === "android" && isDatePickerOpen) {
    datePicker = (
      <Host matchContents>
        <DatePickerDialog
          confirmButtonLabel="完了"
          dismissButtonLabel="キャンセル"
          initialDate={datePickerValue.toISOString()}
          onDateSelected={selectDateFromDialog}
          onDismissRequest={() => {
            setIsDatePickerOpen(false);
          }}
          variant="picker"
        />
      </Host>
    );
  } else if (Platform.OS !== "android") {
    datePicker = (
      <NativeDatePicker
        isPresented={isDatePickerOpen}
        onDateChange={selectDateFromPicker}
        onIsPresentedChange={setIsDatePickerOpen}
        value={datePickerValue}
      />
    );
  }

  return (
    <>
      <CalendarHeaderContent
        canReturnToToday={canReturnToToday}
        className={className}
        onPressMonth={openDatePicker}
        onPressToday={onPressToday}
        yearMonth={yearMonth}
      />
      {datePicker}
    </>
  );
};
