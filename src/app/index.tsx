import { addDays } from "date-fns";
import { BlurTargetView, BlurView } from "expo-blur";
import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { MonthPager } from "@/components/calendar/month-pager";
import { PatternGridHeader } from "@/components/pattern/pattern-grid-header";
import { PatternGridView } from "@/components/pattern/pattern-grid-view";

export default function Index() {
  const insets = useSafeAreaInsets();
  const blurTargetRef = useRef<View | null>(null);
  const [yearMonth, setYearMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [targetDate, setTargetDate] = useState<Date>();

  const returnToToday = () => {
    setTargetDate(new Date());
  };

  const selectNextDay = () => {
    setTargetDate(addDays(selectedDate, 1));
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="w-full pb-6"
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        <BlurView
          blurMethod="dimezisBlurViewSdk31Plus"
          blurTarget={blurTargetRef}
          className="bg-background/80"
          intensity={30}
          tint="systemThinMaterial"
        >
          <View style={{ paddingTop: insets.top }}>
            <CalendarHeader
              className="pt-0"
              onPressToday={returnToToday}
              onSelectDate={setTargetDate}
              selectedDate={selectedDate}
              yearMonth={yearMonth}
            />
          </View>
        </BlurView>
        <BlurTargetView ref={blurTargetRef}>
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
          <PatternGridHeader
            onSelectDate={setTargetDate}
            onSelectNextDay={selectNextDay}
            selectedDate={selectedDate}
          />
          <PatternGridView
            onSelectDate={setTargetDate}
            selectedDate={selectedDate}
          />
        </BlurTargetView>
      </ScrollView>
    </View>
  );
}
