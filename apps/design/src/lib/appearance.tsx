import type { ColorScheme } from "@pochical/design/colors";
import type { Appearance } from "@pochical/prototype/components/design-theme";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

// 外観 for the documents, kept in a cookie so the server draws each page
// in the light or dark it will stay in. Under 端末に合わせる the server
// cannot see the device's own setting, so the cookie also keeps the one
// this browser last reported: only a first visit, or a device that turned
// dark since, is drawn light and then turns.
export type SavedAppearance = { appearance: Appearance; device: ColorScheme };

const APPEARANCE = "appearance";
const DEVICE = "device-scheme";
const YEAR = 60 * 60 * 24 * 365;

const appearanceOf = (value: unknown): Appearance =>
  value === "light" || value === "dark" ? value : "system";
const schemeOf = (value: unknown): ColorScheme =>
  value === "dark" ? "dark" : "light";

const parseSaved = (input: unknown): SavedAppearance => {
  if (typeof input !== "object" || input === null) {
    throw new TypeError("A look is an appearance and a device scheme");
  }
  return {
    appearance: appearanceOf("appearance" in input && input.appearance),
    device: schemeOf("device" in input && input.device),
  };
};

export const readAppearance = createServerFn({ method: "GET" }).handler(
  (): SavedAppearance => ({
    appearance: appearanceOf(getCookie(APPEARANCE)),
    device: schemeOf(getCookie(DEVICE)),
  })
);

const saveAppearance = createServerFn({ method: "POST" })
  .validator(parseSaved)
  .handler(({ data }) => {
    const options = {
      httpOnly: true,
      maxAge: YEAR,
      path: "/",
      sameSite: "lax",
    } as const;
    setCookie(APPEARANCE, data.appearance, options);
    setCookie(DEVICE, data.device, options);
  });

const dark = "(prefers-color-scheme: dark)";
const subscribe = (onChange: () => void) => {
  const list = window.matchMedia(dark);
  list.addEventListener("change", onChange);
  return () => {
    list.removeEventListener("change", onChange);
  };
};
const deviceIsDark = () => window.matchMedia(dark).matches;

const AppearanceContext = createContext<{
  appearance: Appearance;
  device: ColorScheme;
  scheme: ColorScheme;
  setAppearance: (appearance: Appearance) => void;
}>({
  appearance: "system",
  device: "light",
  scheme: "light",
  setAppearance: () => undefined,
});

// The look the server drew, kept from then on in the page, which follows
// the device's own setting live and saves each change for the next page
// the server draws.
export function AppearanceProvider({
  saved,
  children,
}: {
  saved: SavedAppearance;
  children: ReactNode;
}) {
  const [appearance, setAppearance] = useState(saved.appearance);
  // The server's guess while the page hydrates, then the device's own.
  const device: ColorScheme = useSyncExternalStore(
    subscribe,
    deviceIsDark,
    () => saved.device === "dark"
  )
    ? "dark"
    : "light";
  const stored = useRef(saved);
  useEffect(() => {
    const last = stored.current;
    if (last.appearance === appearance && last.device === device) {
      return;
    }
    stored.current = { appearance, device };
    void saveAppearance({ data: stored.current });
  }, [appearance, device]);
  const look = useMemo(
    () => ({
      appearance,
      device,
      scheme: appearance === "system" ? device : appearance,
      setAppearance,
    }),
    [appearance, device]
  );
  return <AppearanceContext value={look}>{children}</AppearanceContext>;
}

export const useAppearance = () => use(AppearanceContext);
