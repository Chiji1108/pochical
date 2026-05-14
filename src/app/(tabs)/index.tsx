import { addDays, isSameMonth, startOfMonth } from "date-fns";
import { BlurTargetView, BlurView } from "expo-blur";
import { useRef, useState } from "react";
import { type LayoutChangeEvent, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { CalendarPager } from "@/components/calendar/calendar-pager";
import { PatternGridHeader } from "@/components/pattern/pattern-grid-header";
import { PatternGridView } from "@/components/pattern/pattern-grid-view";
import { ShiftDetailView } from "@/components/shift/shift-detail-view";

const TAB_OVERLAP_SCROLL_PADDING = 36;

export default function Index() {
  const insets = useSafeAreaInsets();
  const blurTargetRef = useRef<View | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isDetailInputMode, setIsDetailInputMode] = useState(false);
  const [isShiftInputMode, setIsShiftInputMode] = useState(false);
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

  const toggleShiftInputMode = () => {
    setIsShiftInputMode((current) => {
      if (current) {
        setIsDetailInputMode(false);
      }

      return !current;
    });
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
        contentContainerClassName="w-full"
        contentContainerStyle={{
          paddingBottom: insets.bottom + TAB_OVERLAP_SCROLL_PADDING,
          paddingTop: headerHeight,
        }}
        showsVerticalScrollIndicator={false}
      >
        <BlurTargetView ref={blurTargetRef}>
          <CalendarPager
            isDetailInputMode={isDetailInputMode}
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
            isShiftInputMode={isShiftInputMode}
            onSelectDate={setTargetDate}
            onSelectNextDay={selectNextDay}
            onToggleShiftInputMode={toggleShiftInputMode}
            selectedDate={selectedDate}
          />
          {isShiftInputMode ? (
            <PatternGridView
              isDetailInputMode={isDetailInputMode}
              onSelectDate={selectDateImmediately}
              onToggleDetailInputMode={() => {
                setIsDetailInputMode((current) => !current);
              }}
              selectedDate={selectedDate}
            />
          ) : (
            <ShiftDetailView selectedDate={selectedDate} />
          )}
        </BlurTargetView>
      </ScrollView>
    </View>
  );
}
