import type { ReactNode } from "react";

import type {
  ColorScheme,
  ColorToken,
  ThemeFamily,
} from "../lib/design-tokens";
import {
  colorSchemes,
  markColorIn,
  markColors,
  neutralTokenGroups,
  themeFamilies,
} from "../lib/design-tokens";
import { themeColors, themes, themeStyle } from "./design-theme";
import type { NeutralTintMode, Theme } from "./design-theme";

const schemeLabels: Record<ColorScheme, string> = {
  dark: "ダーク",
  light: "ライト",
};

const textTokens = new Set([
  "text",
  "text-2",
  "text-3",
  "text-4",
  "text-faint",
  "text-disabled",
  "holiday",
  "saturday",
  "danger",
]);
const lineTokens = new Set([
  "border",
  "separator",
  "separator-faint",
  "border-strong",
]);

// The accent roles of a theme, in the order a screen uses them.
const themeRoles = [
  { key: "accent", label: "文字・線", name: "accent" },
  { key: "fill", label: "塗り", name: "accent-fill" },
  { key: "onFill", label: "塗りの上の文字", name: "on-accent-fill" },
  { key: "strong", label: "押したとき", name: "accent-strong" },
  { key: "line", label: "フォーカス・見出し", name: "accent-line" },
  { key: "muted", label: "選択中の枠", name: "accent-muted" },
  { key: "border", label: "薄い枠", name: "accent-border" },
  { key: "press", label: "押したときの背景", name: "accent-press" },
  { key: "soft2", label: "薄い背景2", name: "accent-soft-2" },
  { key: "soft", label: "薄い背景", name: "accent-soft" },
  { key: "markTint", label: "休みの地", name: "accent-mark-tint" },
] as const;

// Relative luminance of a #rrggbb color, per WCAG 2.
function luminance(hex: string) {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

// WCAG 2 contrast ratio between two #rrggbb colors.
function contrast(first: string, second: string) {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastGrade(ratio: number) {
  if (ratio >= 7) {
    return "AAA";
  }
  if (ratio >= 4.5) {
    return "AA";
  }
  if (ratio >= 3) {
    return "AA 大";
  }
  return "—";
}

function ContrastBadge({ ratio }: { ratio: number }) {
  const grade = contrastGrade(ratio);
  return (
    <span className="cp-contrast" data-pass={grade !== "—"}>
      {ratio.toFixed(1)}
      <small>{grade}</small>
    </span>
  );
}

function valueOf(scheme: ColorScheme, name: string) {
  const token = neutralTokenGroups
    .flatMap(({ tokens }) => tokens)
    .find((candidate) => candidate.name === name);
  return token?.[scheme] ?? "#000000";
}

// What a neutral token looks like where the app uses it.
function TokenSample({ token }: { token: ColorToken }) {
  const color = `var(--${token.name})`;
  if (textTokens.has(token.name)) {
    return (
      <span className="cp-text-sample" style={{ color }}>
        Aa あ 12
      </span>
    );
  }
  if (lineTokens.has(token.name)) {
    return (
      <span
        className="cp-line-sample"
        style={{
          borderColor: color,
          borderStyle: token.name === "border-strong" ? "dashed" : "solid",
        }}
      />
    );
  }
  if (token.name.startsWith("on-")) {
    const ground = {
      "on-badge": "var(--badge)",
      "on-inverse": "var(--inverse)",
    }[token.name];
    return (
      <span className="cp-block" style={{ background: ground, color }}>
        完了
      </span>
    );
  }
  if (token.name.startsWith("shadow")) {
    return (
      <span className="cp-block" style={{ boxShadow: `0 6px 16px ${color}` }} />
    );
  }
  return <span className="cp-block" style={{ background: color }} />;
}

function TokenCell({
  scheme,
  token,
}: {
  scheme: ColorScheme;
  token: ColorToken;
}) {
  const value = token[scheme];
  const ground = valueOf(scheme, "bg");
  return (
    <div className="cp-cell" style={themeStyle("moss", scheme)}>
      <TokenSample token={token} />
      <code>{value}</code>
      {textTokens.has(token.name) ? (
        <ContrastBadge ratio={contrast(value.slice(0, 7), ground)} />
      ) : null}
    </div>
  );
}

function Section({
  children,
  description,
  id,
  title,
}: {
  children: ReactNode;
  description: string;
  id: string;
  title: string;
}) {
  return (
    <section aria-labelledby={id} className="cp-section">
      <h2 id={id}>{title}</h2>
      <p className="cp-section-description">{description}</p>
      {children}
    </section>
  );
}

function NeutralTokens() {
  return (
    <Section
      description="役割ごとの色です。design.css はこの名前の変数だけを使います。文字の色には、画面の背景に対するコントラスト比を添えています。"
      id="cp-neutral"
      title="基本色"
    >
      {neutralTokenGroups.map((group) => (
        <div className="cp-group" key={group.label}>
          <h3>{group.label}</h3>
          <table className="cp-table">
            <thead>
              <tr>
                <th scope="col">名前</th>
                <th scope="col">{schemeLabels.light}</th>
                <th scope="col">{schemeLabels.dark}</th>
              </tr>
            </thead>
            <tbody>
              {group.tokens.map((token) => (
                <tr key={token.name}>
                  <th className="cp-name" scope="row">
                    <code>--{token.name}</code>
                    {token.label}
                  </th>
                  <td>
                    <TokenCell scheme="light" token={token} />
                  </td>
                  <td>
                    <TokenCell scheme="dark" token={token} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </Section>
  );
}

function ThemePalette({
  family,
  scheme,
  theme,
}: {
  family: ThemeFamily;
  scheme: ColorScheme;
  theme: Theme;
}) {
  const colors = themeColors(theme, scheme, family);
  return (
    <div
      className="cp-theme-scheme"
      style={themeStyle(theme.id, scheme, "none", family)}
    >
      <div className="cp-theme-preview">
        <span className="cp-theme-button">完了</span>
        <span className="cp-theme-chip">選択中</span>
        <span className="cp-theme-link">月で見る</span>
      </div>
      <ul className="cp-swatches">
        {themeRoles.map((role) => (
          <li key={role.key}>
            <span
              aria-hidden="true"
              className="cp-swatch"
              style={{ background: colors[role.key] }}
            />
            <span className="cp-swatch-label">{role.label}</span>
            <code>{colors[role.key]}</code>
          </li>
        ))}
      </ul>
      <p className="cp-theme-contrast">
        文字と背景の比{" "}
        <ContrastBadge ratio={contrast(colors.accent, valueOf(scheme, "bg"))} />
        塗りと文字の比{" "}
        <ContrastBadge ratio={contrast(colors.onFill, colors.fill)} />
      </p>
    </div>
  );
}

const familyLabels: Record<ThemeFamily, string> = {
  deep: "深め",
  pastel: "パステル",
};

const familyDescriptions: Record<ThemeFamily, string> = {
  deep: "設定で選べる6色です。どのテーマでも同じ役割の変数（--accent など）に入り、画面の組み方は変わりません。深めの系統は、塗りと文字に同じ色を使います。",
  pastel:
    "同じ6色の色相から、決まりに沿って作ったパステルです。塗りは淡く、上の文字は濃くします。文字と線は読める濃さを保ち、背景にもごく淡く色みを乗せます。",
};

function ThemeTokens({ family, id }: { family: ThemeFamily; id: string }) {
  return (
    <Section
      description={familyDescriptions[family]}
      id={id}
      title={`テーマカラー（${familyLabels[family]}）`}
    >
      {family === "deep" ? (
        <p className="cp-role-list">
          {themeRoles.map((role) => (
            <span key={role.key}>
              <code>--{role.name}</code>
              {role.label}
            </span>
          ))}
        </p>
      ) : null}
      <div className="cp-themes">
        {themes.map((theme) => (
          <article className="cp-theme" key={theme.id}>
            <h3>{theme.name}</h3>
            <ThemePalette family={family} scheme="light" theme={theme} />
            <ThemePalette family={family} scheme="dark" theme={theme} />
          </article>
        ))}
      </div>
    </Section>
  );
}

const tintModes: { mode: NeutralTintMode; label: string }[] = [
  { label: "いつも同じ", mode: "none" },
  { label: "テーマに合わせる", mode: "theme" },
];

// A few rows of a settings-like screen, to judge the grays as a whole.
function MiniScreen({
  mode,
  scheme,
  theme,
}: {
  mode: NeutralTintMode;
  scheme: ColorScheme;
  theme: Theme;
}) {
  return (
    <div className="cp-mini" style={themeStyle(theme.id, scheme, mode)}>
      <p className="cp-mini-title">設定</p>
      <p className="cp-mini-heading">表示</p>
      <div className="cp-mini-list">
        <p>
          スタイル<span>ナチュラル</span>
        </p>
        <p>
          週の始まり<span>日曜</span>
        </p>
      </div>
      <p className="cp-mini-note">あとから変えられます</p>
      <span className="cp-mini-button">保存</span>
    </div>
  );
}

function TintTokens() {
  return (
    <Section
      description="画面のグレーをテーマの色相に寄せるかどうかの比較です。明るさはそのままで、色相をテーマに回し、テーマ色の鮮やかさに合わせて色みの強さを変えます。日曜・土曜・削除などの意味のある色は変えません。"
      id="cp-tint"
      title="背景の色み"
    >
      <div className="cp-tints">
        {themes.map((theme) => (
          <article key={theme.id}>
            <h3>{theme.name}</h3>
            {(["light", "dark"] as const).map((scheme) => (
              <div className="cp-tint-row" key={scheme}>
                {tintModes.map(({ label, mode }) => (
                  <figure key={mode}>
                    <MiniScreen mode={mode} scheme={scheme} theme={theme} />
                    <figcaption>
                      {schemeLabels[scheme]}・{label}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ))}
          </article>
        ))}
      </div>
    </Section>
  );
}

function MarkChip({
  family,
  option,
  scheme,
}: {
  family: ThemeFamily;
  option: (typeof markColors)[number];
  scheme: ColorScheme;
}) {
  const { color, tint } = markColorIn(option, scheme, family);
  return (
    <div className="cp-mark" style={themeStyle("moss", scheme, "none", family)}>
      <span className="cp-mark-tile" style={{ background: tint, color }}>
        {option.name.slice(0, 1)}
      </span>
      <span className="cp-mark-values">
        <small>
          {familyLabels[family]}・{schemeLabels[scheme]}
        </small>
        <code>{color}</code>
        <code>{tint}</code>
      </span>
      <ContrastBadge ratio={contrast(color, tint)} />
    </div>
  );
}

function MarkTokens() {
  return (
    <Section
      description="シフトごとに選べる12色です。濃い色は記号と文字、薄い色はその地に使います。比は記号の色と地の色のコントラストです。パステルは同じ色相から作ります。"
      id="cp-marks"
      title="シフトの色"
    >
      <div className="cp-marks">
        {markColors.map((option) => (
          <article className="cp-mark-card" key={option.name}>
            <h3>{option.name}</h3>
            {themeFamilies.map((family) =>
              colorSchemes.map((scheme) => (
                <MarkChip
                  family={family}
                  key={`${family}-${scheme}`}
                  option={option}
                  scheme={scheme}
                />
              ))
            )}
          </article>
        ))}
      </div>
    </Section>
  );
}

export function DesignColors() {
  return (
    <>
      <nav aria-label="このページの内容" className="design-index">
        {[
          { href: "#cp-neutral", number: "01", title: "基本色" },
          { href: "#cp-themes", number: "02", title: "テーマ（深め）" },
          { href: "#cp-pastel", number: "03", title: "テーマ（パステル）" },
          { href: "#cp-tint", number: "04", title: "背景の色み" },
          { href: "#cp-marks", number: "05", title: "シフトの色" },
        ].map(({ href, number, title }) => (
          <a href={href} key={href}>
            <span>{number}</span>
            {title}
          </a>
        ))}
      </nav>
      <NeutralTokens />
      <ThemeTokens family="deep" id="cp-themes" />
      <ThemeTokens family="pastel" id="cp-pastel" />
      <TintTokens />
      <MarkTokens />
    </>
  );
}
