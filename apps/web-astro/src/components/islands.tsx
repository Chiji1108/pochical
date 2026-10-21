import {
  FeatureScreen,
  HeroPhone,
  Sky,
  ThemeGallery,
} from "@pochical/web/src/components/lp-screens";
import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";

// apps/web's lp-screens, each its own island. The pages' ポチッと。 buttons
// are static HTML; their presses reach a sky as a window event, counted
// on window too so presses made before the island arrived still count.
declare global {
  interface Window {
    pochicalPresses?: Record<string, number>;
  }
}

function Motion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function SkyIsland({
  group,
  ...props
}: Omit<ComponentProps<typeof Sky>, "presses"> & { group: string }) {
  const [presses, setPresses] = useState(0);
  useEffect(() => {
    const read = () => setPresses(window.pochicalPresses?.[group] ?? 0);
    read();
    window.addEventListener("pochical:press", read);
    return () => window.removeEventListener("pochical:press", read);
  }, [group]);
  return (
    <Motion>
      <Sky presses={presses} {...props} />
    </Motion>
  );
}

export function HeroPhoneIsland() {
  return (
    <Motion>
      <HeroPhone />
    </Motion>
  );
}

export function FeatureScreenIsland(props: ComponentProps<typeof FeatureScreen>) {
  return (
    <Motion>
      <FeatureScreen {...props} />
    </Motion>
  );
}

export function ThemeGalleryIsland() {
  return (
    <Motion>
      <ThemeGallery />
    </Motion>
  );
}
