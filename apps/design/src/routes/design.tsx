import { createFileRoute, redirect } from "@tanstack/react-router";

// The documents' index is design.pochical.app itself.
export const Route = createFileRoute("/design")({
  beforeLoad: () => {
    // TanStack Router redirects by throwing what redirect() returns.
    // oxlint-disable-next-line typescript/only-throw-error
    throw redirect({ params: { _splat: "" }, to: "/$" });
  },
});
