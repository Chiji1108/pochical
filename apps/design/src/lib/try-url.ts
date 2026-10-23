// The app to try (apps/try), a Worker on its own origin: its dev server
// in .env.development, try.pochical.app in .env.production (every build,
// previews included).
declare global {
  // Vite's ImportMetaEnv is an interface, so only an interface merges into it.
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface ImportMetaEnv {
    readonly VITE_TRY_ORIGIN: string;
  }
}

export const tryUrl = new URL("/", import.meta.env.VITE_TRY_ORIGIN).href;
