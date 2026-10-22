// design, demo and try are Workers of their own, each on its origin. Each
// app's .env.development (its dev server beside the others) and
// .env.production (every build, previews included) name all three.
declare global {
  // Vite's ImportMetaEnv is an interface, so only an interface merges into it.
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface ImportMetaEnv {
    readonly VITE_DESIGN_ORIGIN: string;
    readonly VITE_DEMO_ORIGIN: string;
    readonly VITE_TRY_ORIGIN: string;
  }
}

// A page of the design documents (apps/design).
export const designUrl = (path: string) =>
  new URL(path, import.meta.env.VITE_DESIGN_ORIGIN).href;

// A page of the demo (apps/demo).
export const demoUrl = (path: string) =>
  new URL(path, import.meta.env.VITE_DEMO_ORIGIN).href;

// A page of the app to try (apps/try).
export const tryUrl = (path: string) =>
  new URL(path, import.meta.env.VITE_TRY_ORIGIN).href;
