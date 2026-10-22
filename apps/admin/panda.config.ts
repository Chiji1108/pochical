import { appConfig } from "@pochical/styled-system/config";

// Panda CSS for this app, from @pochical/styled-system's config: the admin
// site's own pieces, none of the prototype's.
export default { ...appConfig, include: ["./app/**/*.{ts,tsx}"] };
