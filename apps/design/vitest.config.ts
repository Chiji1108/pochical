import { defineConfig } from "vitest/config";

// The tests read the source as files, so they run without vite.config.ts's
// plugins, which would start the Worker's runtime.
export default defineConfig({});
