import { createFileRoute, redirect } from "@tanstack/react-router";

// demo.pochical.app opens on the demo, its samples to switch.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // TanStack Router redirects by throwing what redirect() returns.
    // oxlint-disable-next-line typescript/only-throw-error
    throw redirect({ href: "/demo" });
  },
});
