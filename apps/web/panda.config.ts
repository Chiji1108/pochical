import { appConfig } from "@pochical/styled-system/config";

// Panda CSS for this app, from @pochical/styled-system's config, its .astro
// pages included.
export default {
  ...appConfig,
  include: [...(appConfig.include ?? []), "./src/**/*.astro"],
};
