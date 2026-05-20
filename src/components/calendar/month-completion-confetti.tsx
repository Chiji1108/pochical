import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";

const CONFETTI_COLORS = [
  "#16a34a",
  "#2563eb",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
] as const;
const CONFETTI_DURATION_MS = 1800;
const CONFETTI_PIECE_COUNT = 28;
const CONFETTI_START_Y = -24;

type ConfettiPiece = {
  color: string;
  height: number;
  id: string;
  left: number;
  rotate: number;
  width: number;
  xDrift: number;
};

type MonthCompletionConfettiProps = {
  burstKey?: string;
};

const createConfettiPieces = (burstKey: string): ConfettiPiece[] =>
  Array.from({ length: CONFETTI_PIECE_COUNT }, (_, index) => ({
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    height: 9 + Math.round(Math.random() * 8),
    id: `${burstKey}-${index}`,
    left: Math.random(),
    rotate: 180 + Math.round(Math.random() * 540),
    width: 5 + Math.round(Math.random() * 6),
    xDrift: -80 + Math.round(Math.random() * 160),
  }));

export const MonthCompletionConfetti = ({
  burstKey,
}: MonthCompletionConfettiProps) => {
  const { height, width } = useWindowDimensions();
  const progress = useRef(new Animated.Value(1)).current;
  const [activeBurstKey, setActiveBurstKey] = useState<string>();

  const pieces = useMemo(
    () => (activeBurstKey ? createConfettiPieces(activeBurstKey) : []),
    [activeBurstKey]
  );

  useEffect(() => {
    if (!burstKey) {
      return;
    }

    progress.stopAnimation();
    progress.setValue(0);
    setActiveBurstKey(burstKey);

    Animated.timing(progress, {
      duration: CONFETTI_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setActiveBurstKey(undefined);
      }
    });
  }, [burstKey, progress]);

  if (!activeBurstKey) {
    return null;
  }

  return (
    <Animated.View
      className="absolute inset-0 z-50"
      pointerEvents="none"
      style={{
        opacity: progress.interpolate({
          inputRange: [0.8, 1],
          outputRange: [1, 0],
        }),
      }}
    >
      {pieces.map((piece) => {
        const pieceStyle: Animated.WithAnimatedObject<ViewStyle> = {
          backgroundColor: piece.color,
          borderRadius: 2,
          height: piece.height,
          left: piece.left * width,
          position: "absolute",
          top: CONFETTI_START_Y,
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, piece.xDrift],
              }),
            },
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, height * 0.72],
              }),
            },
            {
              rotate: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", `${piece.rotate}deg`],
              }),
            },
          ],
          width: piece.width,
        };

        return <Animated.View key={piece.id} style={pieceStyle} />;
      })}
    </Animated.View>
  );
};
