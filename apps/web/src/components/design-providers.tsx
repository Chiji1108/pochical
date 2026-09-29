import { useEffect } from "react";
import type { ReactNode } from "react";

import { useLook, useSettings } from "../lib/design-settings-store";
import { useDeviceScheme } from "../lib/use-device-scheme";
import {
  ColorSchemeContext,
  ThemeContext,
  presetOf,
  ToneContext,
} from "./design-theme";
import type { Preset } from "./design-theme";
import { WeekSettingsContext } from "./design-week";
import {
  CellNamesContext,
  IconWeightContext,
  MonochromeContext,
  OffDisplayContext,
  OffHighlightContext,
  ShiftMarkStyleContext,
} from "./shift-mark";

// The theme color of the person's テーマ, for pages that color themselves
// with it.
export function useDesignTheme() {
  return presetOf(useSettings((state) => state.device.preset)).theme;
}

// A テーマ other than the person's, for what shows one: its card in the
// settings, or the states page.
export function PresetContexts({
  preset,
  children,
}: {
  preset: Preset;
  children: ReactNode;
}) {
  return (
    <ToneContext value={preset.tone}>
      <ThemeContext value={{ theme: preset.theme }}>
        <MonochromeContext value={{ monochrome: preset.marks === "mono" }}>
          {children}
        </MonochromeContext>
      </ThemeContext>
    </ToneContext>
  );
}

// The settings store as the contexts the screens read. Parts of a page
// override some of them, like a member's own colors or a preview's light
// or dark, which is why they stay contexts rather than store reads. Used
// by /demo and the /design pages alike.
export function DesignProviders({ children }: { children: ReactNode }) {
  const look = useLook();
  const { preset, appearance, week } = useSettings((state) => state.device);
  const { theme, tone, marks } = presetOf(preset);
  // Saved device settings load once the page has hydrated.
  useEffect(() => {
    void useSettings.persist.rehydrate();
  }, []);
  // 外観 follows this computer's own light or dark unless it keeps one.
  const deviceScheme = useDeviceScheme();
  const scheme = appearance === "system" ? deviceScheme : appearance;
  return (
    <WeekSettingsContext value={{ week }}>
      <ColorSchemeContext value={scheme}>
        <ToneContext value={tone}>
          <ThemeContext value={{ theme }}>
            <IconWeightContext value={look.fill ? "duotone" : "regular"}>
              <ShiftMarkStyleContext value={look.style}>
                <CellNamesContext
                  value={{
                    names: {
                      badge: look.names,
                      emoji: look.names,
                      icon: look.names,
                    },
                  }}
                >
                  <OffHighlightContext
                    value={{
                      highlight: {
                        badge: look.highlight,
                        emoji: look.highlight,
                        icon: look.highlight,
                      },
                    }}
                  >
                    <MonochromeContext value={{ monochrome: marks === "mono" }}>
                      <OffDisplayContext
                        value={look.blankOff ? "blank" : "show"}
                      >
                        {children}
                      </OffDisplayContext>
                    </MonochromeContext>
                  </OffHighlightContext>
                </CellNamesContext>
              </ShiftMarkStyleContext>
            </IconWeightContext>
          </ThemeContext>
        </ToneContext>
      </ColorSchemeContext>
    </WeekSettingsContext>
  );
}
