import { appConfig } from "@pochical/styled-system/config";

// Panda CSS for this app, from @pochical/styled-system's config, with the
// pages around the phones the apps share (@pochical/showcase).
export default {
  ...appConfig,
  include: [
    ...(appConfig.include ?? []),
    "../../packages/showcase/src/**/*.{ts,tsx}",
  ],
};
