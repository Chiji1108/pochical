import { Icon } from "@iconify/react/offline";
import type { IconifyIcon } from "@iconify/react/offline";

// Android's own symbols, Material Symbols Rounded (unfilled, weight 400),
// as the app's drawables are, each imported by itself from
// @iconify-icons/material-symbols (its `-outline-rounded` names), so only
// those drawn come along. iOS's screens keep lucide's in place of SF
// Symbols.
export type SymbolData = IconifyIcon;

export function MaterialSymbol({
  icon,
  size = 24,
  className,
}: {
  icon: SymbolData;
  size?: number;
  className?: string;
}) {
  return (
    <Icon
      aria-hidden="true"
      className={className}
      height={size}
      icon={icon}
      width={size}
    />
  );
}
