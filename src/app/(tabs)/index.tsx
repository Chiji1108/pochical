import { addDays, isSameMonth, startOfMonth } from "date-fns";
import { BlurTargetView, BlurView } from "expo-blur";
import { selectionAsync } from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  useColorScheme,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { CalendarPager } from "@/components/calendar/calendar-pager";
import { PatternGridHeader } from "@/components/pattern/pattern-grid-header";
import { PatternGridView } from "@/components/pattern/pattern-grid-view";
import { ShiftDetailView } from "@/components/shift/shift-detail-view";

const DETAIL_PAGE_DRAG_DISTANCE = 180;
const DETAIL_PAGE_SETTLE_THRESHOLD = 0.45;
const DETAIL_PAGE_SWIPE_VELOCITY = 600;
const DETAIL_PAGE_TRANSITION_DURATION = 220;
const BOTTOM_EDGE_FADE_HEIGHT = 36;
const TAB_OVERLAP_PADDING = 36;
const LIGHT_BOTTOM_FADE_RGB = "156, 163, 175";
const DARK_BOTTOM_FADE_RGB = "0, 0, 0";

export default function Index() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const blurTargetRef = useRef<View | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isDetailInputMode, setIsDetailInputMode] = useState(false);
  const [isShiftInputMode, setIsShiftInputMode] = useState(false);
  const [yearMonth, setYearMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [targetDate, setTargetDate] = useState<Date>();
  const detailPageProgress = useSharedValue(0);
  const detailGestureStartProgress = useSharedValue(0);
  const bottomFadeRgb =
    colorScheme === "dark" ? DARK_BOTTOM_FADE_RGB : LIGHT_BOTTOM_FADE_RGB;
  const bottomFadeStyle = useAnimatedStyle(() => ({
    opacity: 1 - detailPageProgress.value,
  }));

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

  const setDetailInputMode = useCallback(
    (isEnabled: boolean) => {
      detailPageProgress.value = withTiming(isEnabled ? 1 : 0, {
        duration: DETAIL_PAGE_TRANSITION_DURATION,
      });

      if (isDetailInputMode !== isEnabled) {
        selectionAsync().catch(() => {
          // Haptics can be unavailable depending on the device or platform.
        });
      }

      setIsDetailInputMode(isEnabled);
    },
    [detailPageProgress, isDetailInputMode]
  );

  const toggleShiftInputMode = () => {
    if (isShiftInputMode) {
      setDetailInputMode(false);
    }

    setIsShiftInputMode((current) => !current);
  };

  const handleHeaderLayout = (event: LayoutChangeEvent) => {
    const nextHeaderHeight = Math.ceil(event.nativeEvent.layout.height);
    setHeaderHeight((currentHeaderHeight) =>
      currentHeaderHeight === nextHeaderHeight
        ? currentHeaderHeight
        : nextHeaderHeight
    );
  };

  const detailModeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .failOffsetX([-24, 24])
        .onBegin(() => {
          cancelAnimation(detailPageProgress);
          detailGestureStartProgress.value = detailPageProgress.value;
        })
        .onUpdate((event) => {
          if (!(isShiftInputMode || isDetailInputMode)) {
            return;
          }

          const nextProgress =
            detailGestureStartProgress.value -
            event.translationY / DETAIL_PAGE_DRAG_DISTANCE;
          detailPageProgress.value = Math.min(1, Math.max(0, nextProgress));
        })
        .onEnd((event) => {
          if (!(isShiftInputMode || isDetailInputMode)) {
            return;
          }

          const shouldOpen =
            event.velocityY < -DETAIL_PAGE_SWIPE_VELOCITY ||
            (event.velocityY <= DETAIL_PAGE_SWIPE_VELOCITY &&
              detailPageProgress.value >= DETAIL_PAGE_SETTLE_THRESHOLD);

          runOnJS(setDetailInputMode)(shouldOpen);
        }),
    [
      detailGestureStartProgress,
      detailPageProgress,
      isDetailInputMode,
      isShiftInputMode,
      setDetailInputMode,
    ]
  );

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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <GestureDetector gesture={detailModeGesture}>
          <BlurTargetView
            className="flex-1 bg-background"
            ref={blurTargetRef}
            style={{
              paddingBottom: insets.bottom + TAB_OVERLAP_PADDING,
              paddingTop: headerHeight,
            }}
          >
            <CalendarPager
              detailTransitionProgress={detailPageProgress}
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
            <View className="flex-1">
              {isShiftInputMode ? (
                <PatternGridView
                  onSelectDate={selectDateImmediately}
                  selectedDate={selectedDate}
                />
              ) : (
                <ShiftDetailView selectedDate={selectedDate} />
              )}
            </View>
          </BlurTargetView>
        </GestureDetector>
      </KeyboardAvoidingView>
      {isShiftInputMode ? (
        <Animated.View
          className="absolute inset-x-0 bottom-0 z-20"
          pointerEvents={isDetailInputMode ? "none" : "auto"}
          style={[
            { height: insets.bottom + BOTTOM_EDGE_FADE_HEIGHT },
            bottomFadeStyle,
          ]}
        >
          <LinearGradient
            colors={[
              `rgba(${bottomFadeRgb}, 0)`,
              `rgba(${bottomFadeRgb}, 0.9)`,
            ]}
            locations={[0, 1]}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
