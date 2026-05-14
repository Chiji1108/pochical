import { addDays, isSameMonth, startOfMonth } from "date-fns";
import { BlurTargetView, BlurView } from "expo-blur";
import { useRef, useState } from "react";
import { type LayoutChangeEvent, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { MonthPager } from "@/components/calendar/month-pager";
import { PatternGridHeader } from "@/components/pattern/pattern-grid-header";
import { PatternGridView } from "@/components/pattern/pattern-grid-view";

export default function Index() {
  const insets = useSafeAreaInsets();
  const blurTargetRef = useRef<View | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [yearMonth, setYearMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [targetDate, setTargetDate] = useState<Date>();

  const returnToToday = () => {
    setTargetDate(new Date());
  };

  const selectDateImmediately = (date: Date) => {
    setSelectedDate(date);

    if (!isSameMonth(date, yearMonth)) {
      setYearMonth(startOfMonth(date));
      setTargetDate(date);
    }
  };

  const selectNextDay = () => {
    selectDateImmediately(addDays(selectedDate, 1));
  };

  const handleHeaderLayout = (event: LayoutChangeEvent) => {
    const nextHeaderHeight = Math.ceil(event.nativeEvent.layout.height);
    setHeaderHeight((currentHeaderHeight) =>
      currentHeaderHeight === nextHeaderHeight
        ? currentHeaderHeight
        : nextHeaderHeight
    );
  };

  return (
    <View className="flex-1 bg-background">
      <BlurView
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={blurTargetRef}
        className="absolute inset-x-0 top-0 z-10 bg-background/95"
        intensity={30}
        onLayout={handleHeaderLayout}
        style={{ paddingTop: insets.top }}
        tint="systemThinMaterial"
      >
        <CalendarHeader
          className="pt-0"
          onPressToday={returnToToday}
          onSelectDate={setTargetDate}
          selectedDate={selectedDate}
          yearMonth={yearMonth}
        />
      </BlurView>
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="w-full pb-6"
        contentContainerStyle={{ paddingTop: headerHeight }}
        showsVerticalScrollIndicator={false}
      >
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
            onSelectDate={selectDateImmediately}
            selectedDate={selectedDate}
          />
        </BlurTargetView>
      </ScrollView>
    </View>
  );
}
