import { useState } from "react";
import { View } from "react-native";
import { CalendarBody } from "@/components/calendar/calendar-body";
import { CalendarHeader } from "@/components/calendar/calendar-header";

export default function Index() {
  const [yearMonth, setYearMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>();
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <View className="w-full">
        <CalendarHeader setYearMonth={setYearMonth} yearMonth={yearMonth} />
        <CalendarBody
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          yearMonth={yearMonth}
        />
      </View>
    </View>
  );
}
