import type { Appearance } from "@pochical/prototype/components/design-theme";
import { useSettings } from "@pochical/prototype/lib/design-settings-store";
import type { ThemeSwitchProps } from "fumadocs-ui/layouts/shared/slots/theme-switch";
import { Airplay, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Fumadocs UI's light, dark and system switch, drawn as its own
// ("light-dark-system"), set to 外観 in the prototype's settings rather
// than to next-themes: the documents follow the same light or dark as the
// screens they show (__root.tsx).
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
  const appearance = useSettings((state) => state.device.appearance);
  const setAppearance = useSettings((state) => state.setAppearance);
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
