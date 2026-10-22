// The other apps are Workers of their own, each on its origin
// (VITE_*_ORIGIN, from .env.development and .env.production).

// A page of the design documents (apps/design).
export const designUrl = (path: string) =>
  new URL(path, import.meta.env.VITE_DESIGN_ORIGIN).href;

// A page of the app to try (apps/try).
export const tryUrl = (path: string) =>
  new URL(path, import.meta.env.VITE_TRY_ORIGIN).href;
