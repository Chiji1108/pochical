// HTML's invoker commands (a button opening or closing a dialog without
// script), which @types/react 19.3 does not know yet.
import "react";

declare module "react" {
  // Module augmentation only merges into an interface.
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface ButtonHTMLAttributes<T> {
    command?: "show-modal" | "close";
    commandfor?: string;
  }
}
