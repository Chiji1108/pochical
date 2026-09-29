import { useEffect } from "react";
import type { ReactNode } from "react";

import { useLook, useSettings } from "../lib/design-settings-store";
import { useDeviceScheme } from "../lib/use-device-scheme";
import { ColorSchemeContext, presetOf, ThemeContext } from "./design-theme";
import type { PresetId } from "./design-theme";
import { WeekSettingsContext } from "./design-week";
import {
  CellNamesContext,
  IconWeightContext,
  MonochromeContext,
  OffDisplayContext,
  OffHighlightContext,
  ShiftMarkStyleContext,
} from "./shift-mark";

// The person's テーマ, for pages that color themselves with it: a Pro one
// being tried on while it is.
export function useDesignTheme() {
  return useSettings((state) => state.tryOn ?? state.device.preset);
}

// A テーマ other than the person's, for what shows one: its card in the
// settings, or the states page.
export function PresetContexts({
  id,
  children,
}: {
  id: PresetId;
  children: ReactNode;
}) {
  const { scheme } = presetOf(id);
  const themed = <ThemeContext value={{ theme: id }}>{children}</ThemeContext>;
  // An always-dark テーマ draws its marks for its own dark screen.
  return scheme ? (
    <ColorSchemeContext value={scheme}>{themed}</ColorSchemeContext>
  ) : (
    themed
  );
}

// The settings store as the contexts the screens read. Parts of a page
// override some of them, like a member's own colors or a preview's light
// or dark, which is why they stay contexts rather than store reads. Used
// by /demo and the /design pages alike.
export function DesignProviders({ children }: { children: ReactNode }) {
  const look = useLook();
  const { appearance, week, shiftColors } = useSettings(
    (state) => state.device
  );
  const preset = useDesignTheme();
  // Saved device settings load once the page has hydrated.
  useEffect(() => {
    void useSettings.persist.rehydrate();
  }, []);
  // 外観 follows this computer's own light or dark unless it keeps one.
  const deviceScheme = useDeviceScheme();
  // An always-dark テーマ keeps its dark whatever 外観 says.
  const scheme =
    presetOf(preset).scheme ??
    (appearance === "system" ? deviceScheme : appearance);
  return (
    <WeekSettingsContext value={{ week }}>
      <ColorSchemeContext value={scheme}>
        <ThemeContext value={{ theme: preset }}>
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
                  <MonochromeContext value={{ monochrome: !shiftColors }}>
                    <OffDisplayContext value={look.blankOff ? "blank" : "show"}>
                      {children}
                    </OffDisplayContext>
                  </MonochromeContext>
                </OffHighlightContext>
              </CellNamesContext>
            </ShiftMarkStyleContext>
          </IconWeightContext>
        </ThemeContext>
      </ColorSchemeContext>
    </WeekSettingsContext>
  );
}
