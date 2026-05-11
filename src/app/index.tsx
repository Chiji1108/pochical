import { addDays } from "date-fns";
import { selectionAsync } from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { Button } from "heroui-native/button";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import { CalendarDatePickerButton } from "@/components/calendar/calendar-date-picker-button";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { MonthPager } from "@/components/calendar/month-pager";

const selectedDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const selectedWeekdayFormatter = new Intl.DateTimeFormat("ja-JP", {
  weekday: "short",
});

const StyledSafeAreaView = withUniwind(SafeAreaView);

export default function Index() {
  const [yearMonth, setYearMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [targetDate, setTargetDate] = useState<Date>();

  const returnToToday = () => {
    setTargetDate(new Date());
  };

  const selectNextDay = async () => {
    setTargetDate(addDays(selectedDate, 1));

    try {
      await selectionAsync();
    } catch {
      // Haptics can be unavailable depending on the device or platform.
    }
  };

  return (
    <StyledSafeAreaView
      className="flex-1 bg-background"
      edges={["top", "left", "right"]}
    >
      <View className="w-full">
        <CalendarHeader
          onPressToday={returnToToday}
          onSelectDate={setTargetDate}
          selectedDate={selectedDate}
          yearMonth={yearMonth}
        />
        <MonthPager
          onTargetDateHandled={() => {
            setTargetDate(undefined);
          }}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          setYearMonth={setYearMonth}
          targetDate={targetDate}
          yearMonth={yearMonth}
        />
        <View className="flex-row items-center justify-between px-2 pt-3">
          <CalendarDatePickerButton
            onSelectDate={setTargetDate}
            value={selectedDate}
            variant="ghost"
          >
            <Button.Label className="font-semibold text-base">
              {`${selectedDateFormatter.format(selectedDate)}(${selectedWeekdayFormatter.format(
                selectedDate
              )})`}
            </Button.Label>
          </CalendarDatePickerButton>
          <Button
            accessibilityLabel="翌日を選択"
            className="mx-2"
            onPress={selectNextDay}
            size="sm"
            variant="outline"
          >
            <SymbolView
              name={{
                android: "forward",
                ios: "forward",
                web: "forward",
              }}
              size={16}
            />
            <Button.Label>翌日</Button.Label>
          </Button>
        </View>
      </View>
    </StyledSafeAreaView>
  );
}
