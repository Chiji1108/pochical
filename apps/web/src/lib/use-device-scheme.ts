import { useSyncExternalStore } from "react";

import type { ColorScheme } from "./design-tokens";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

const deviceScheme = (): ColorScheme =>
  window.matchMedia(DARK_QUERY).matches ? "dark" : "light";

// The light or dark setting of the device viewing the page, standing in for
// the phone's own setting behind 外観 → 端末に合わせる. Server renders light.
export function useDeviceScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, deviceScheme, () => "light");
}
