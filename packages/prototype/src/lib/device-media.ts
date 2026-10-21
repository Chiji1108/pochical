import type { ColorScheme } from "@pochical/design/colors";
import { useSyncExternalStore } from "react";

// Settings of the device viewing the page, read from CSS media queries and
// followed as they change. The server cannot know them, so it draws as if
// neither were on, and the browser draws the same while it takes over that
// HTML, then turns to the device's own. motion's useReducedMotion reads the
// device at once instead, which made pages drawn on the server fail to
// hydrate with Reduce Motion on.
function mediaQuery(query: string) {
  let list: MediaQueryList | undefined;
  const get = () => {
    list ??= window.matchMedia(query);
    return list;
  };
  return {
    matches: () => get().matches,
    subscribe: (onChange: () => void) => {
      get().addEventListener("change", onChange);
      return () => {
        get().removeEventListener("change", onChange);
      };
    },
  };
}

const dark = mediaQuery("(prefers-color-scheme: dark)");
const reducedMotion = mediaQuery("(prefers-reduced-motion: reduce)");
const onServer = () => false;

// The device's light or dark setting, standing in for the phone's own
// setting behind 外観 → 端末に合わせる.
export function useDeviceScheme(): ColorScheme {
  return useSyncExternalStore(dark.subscribe, dark.matches, onServer)
    ? "dark"
    : "light";
}

// The device's 視差効果を減らす (Reduce Motion) setting.
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    reducedMotion.subscribe,
    reducedMotion.matches,
    onServer
  );
}
