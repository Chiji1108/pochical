import { appConfig } from "@pochical/styled-system/config";

// Panda CSS for apps/design, apps/demo and apps/try, each of which exports
// it as its panda.config.ts: @pochical/styled-system's config, with this
// package's pages around the phones. The path is from the app's folder.
export default {
  ...appConfig,
  include: [
    ...(appConfig.include ?? []),
    "../../packages/showcase/src/**/*.{ts,tsx}",
  ],
};
