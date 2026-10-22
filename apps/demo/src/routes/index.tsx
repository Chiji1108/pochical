import { parseDesignVariants } from "@pochical/prototype/lib/design-variants";
import { createFileRoute, redirect } from "@tanstack/react-router";

// demo.pochical.app opens on the demo, its samples to switch, with the
// current proposal for each open design choice.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // TanStack Router redirects by throwing what redirect() returns.
    // oxlint-disable-next-line typescript/only-throw-error
    throw redirect({ search: parseDesignVariants({}), to: "/demo" });
  },
});
