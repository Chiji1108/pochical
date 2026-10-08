import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createTanStackRouter({ routeTree, scrollRestoration: true });
}

declare module "@tanstack/react-router" {
  // Module augmentation only merges into an interface.
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
