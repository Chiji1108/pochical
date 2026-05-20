import { useEffect, useRef } from "react";
import { useWindowDimensions } from "react-native";
import { Confetti, type ConfettiMethods } from "react-native-fast-confetti";

const CONFETTI_BLAST_DURATION_MS = 360;
const CONFETTI_COUNT = 180;
const CONFETTI_FALL_DURATION_MS = 2600;

type MonthCompletionConfettiProps = {
  burstKey?: string;
};

export const MonthCompletionConfetti = ({
  burstKey,
}: MonthCompletionConfettiProps) => {
  const { height, width } = useWindowDimensions();
  const confettiRef = useRef<ConfettiMethods>(null);

  useEffect(() => {
    if (!burstKey) {
      return;
    }

    confettiRef.current?.restart({
      cannonsPositions: [
        { x: width * 0.08, y: height * 0.56 },
        { x: width * 0.92, y: height * 0.56 },
      ],
    });
  }, [burstKey, height, width]);

  return (
    <Confetti
      autoplay={false}
      blastDuration={CONFETTI_BLAST_DURATION_MS}
      containerStyle={{ zIndex: 50 }}
      count={CONFETTI_COUNT}
      fadeOutOnEnd
      fallDuration={CONFETTI_FALL_DURATION_MS}
      flakeSize={{ height: 14, width: 7 }}
      height={height}
      randomOffset={{ x: { max: 90, min: -90 }, y: { max: 160, min: 0 } }}
      ref={confettiRef}
      sizeVariation={0.35}
      verticalSpacing={24}
      width={width}
    />
  );
};
