import { createFileRoute, redirect } from "@tanstack/react-router";

// The catalog opens on its documents.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // TanStack Router redirects by throwing what redirect() returns.
    // oxlint-disable-next-line typescript/only-throw-error
    throw redirect({ to: "/design" });
  },
});
