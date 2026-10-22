import type { Appearance } from "@pochical/prototype/components/design-theme";
import type { ThemeSwitchProps } from "fumadocs-ui/layouts/shared/slots/theme-switch";
import { Airplay, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useLook } from "../lib/appearance";

// Fumadocs UI's light, dark and system switch, drawn as its own
// ("light-dark-system"), set to the documents' 外観 (lib/appearance.tsx)
// rather than to next-themes.
const choices = [
  { Icon: Sun, appearance: "light", label: "ライト" },
  { Icon: Moon, appearance: "dark", label: "ダーク" },
  { Icon: Airplay, appearance: "system", label: "端末に合わせる" },
] as const satisfies readonly {
  Icon: LucideIcon;
  appearance: Appearance;
  label: string;
}[];

export function DocsThemeSwitch({ className, ...props }: ThemeSwitchProps) {
  const { appearance, setAppearance } = useLook();
  return (
    <div
      className={`inline-flex items-center overflow-hidden rounded-full border p-1 *:rounded-full ${className ?? ""}`}
      data-theme-toggle=""
      {...props}
    >
      {choices.map(({ Icon, appearance: choice, label }) => (
        <button
          aria-label={label}
          aria-pressed={appearance === choice}
          className={`size-6.5 p-1.5 ${appearance === choice ? "bg-fd-accent text-fd-accent-foreground" : "text-fd-muted-foreground"}`}
          key={choice}
          onClick={() => {
            setAppearance(choice);
          }}
          type="button"
        >
          <Icon className="size-full" fill="currentColor" />
        </button>
      ))}
    </div>
  );
}
