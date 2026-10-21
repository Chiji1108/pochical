import type { ComponentProps } from "react";

// apps/web's components link with TanStack Router's <Link to>. Rendered
// here without a router, a plain anchor draws the same markup.
export function Link({ to, ...props }: ComponentProps<"a"> & { to: string }) {
  return <a href={to} {...props} />;
}
