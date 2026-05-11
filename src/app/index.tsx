import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { MonthPager } from "@/components/calendar/month-pager";

export default function Index() {
  const [yearMonth, setYearMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [targetDate, setTargetDate] = useState<Date>();

  const returnToToday = () => {
    setTargetDate(new Date());
  };

  return (
    <SafeAreaView
      className="flex-1 items-center justify-start bg-background pt-2"
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
      </View>
    </SafeAreaView>
  );
}
