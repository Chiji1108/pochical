// The other apps are Workers of their own, each on its origin
// (VITE_*_ORIGIN, from .env.development and .env.production).

// A page of the demo (apps/demo).
export const demoUrl = (path: string) =>
  new URL(path, import.meta.env.VITE_DEMO_ORIGIN).href;
