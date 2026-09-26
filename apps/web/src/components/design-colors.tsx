import type { ReactNode } from "react";

import type { ColorScheme, ColorToken, Tone } from "../lib/design-tokens";
import {
  colorSchemes,
  markColorIn,
  markColors,
  neutralTokenGroups,
  tones,
} from "../lib/design-tokens";
import { hexToOklch } from "../lib/oklch";
import { themeColors, themes, themeStyle } from "./design-theme";
import type { Theme } from "./design-theme";

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
  tone,
  scheme,
  theme,
}: {
  tone: Tone;
  scheme: ColorScheme;
  theme: Theme;
}) {
  const colors = themeColors(theme, scheme, tone);
  return (
    <div className="cp-theme-scheme" style={themeStyle(theme.id, scheme, tone)}>
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

const toneLabels: Record<Tone, string> = {
  deep: "深め",
  dusty: "くすみ",
  pastel: "パステル",
};

const toneDescriptions: Record<Tone, string> = {
  deep: "設定で選べる6色です。どのテーマでも同じ役割の変数（--accent など）に入り、画面の組み方は変わりません。深めのトーンは、塗りと文字に同じ色を使います。",
  dusty:
    "同じ6色の色相から、彩度を落としてグレーを混ぜたくすみ色です。背景とグレーはテーマに関係なく温かいグレージュにし、塗りは白い文字が読める中くらいの濃さにします。",
  pastel:
    "同じ6色の色相から、決まりに沿って作ったパステルです。塗りは淡く、上の文字は濃くします。文字と線は読める濃さを保ち、背景にもごく淡く色みを乗せます。",
};

function ThemeTokens({ tone, id }: { tone: Tone; id: string }) {
  return (
    <Section
      description={toneDescriptions[tone]}
      id={id}
      title={`テーマカラー（${toneLabels[tone]}）`}
    >
      {tone === "deep" ? (
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
            <ThemePalette tone={tone} scheme="light" theme={theme} />
            <ThemePalette tone={tone} scheme="dark" theme={theme} />
          </article>
        ))}
      </div>
    </Section>
  );
}

function MarkChip({
  tone,
  option,
  scheme,
}: {
  tone: Tone;
  option: (typeof markColors)[number];
  scheme: ColorScheme;
}) {
  const { color, tint } = markColorIn(option, scheme, tone);
  return (
    <div className="cp-mark" style={themeStyle("moss", scheme, tone)}>
      <span className="cp-mark-tile" style={{ background: tint, color }}>
        {option.name.slice(0, 1)}
      </span>
      <span className="cp-mark-values">
        <small>
          {toneLabels[tone]}・{schemeLabels[scheme]}
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
            {tones.map((tone) =>
              colorSchemes.map((scheme) => (
                <MarkChip
                  tone={tone}
                  key={`${tone}-${scheme}`}
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

// Distance in OKLab; about 0.02 is where two small marks start to blur.
function colorDistance(first: string, second: string) {
  const toLab = (hex: string) => {
    const { chroma, hue, lightness } = hexToOklch(hex);
    const radians = (hue * Math.PI) / 180;
    return [lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)];
  };
  const [a, b] = [toLab(first), toLab(second)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const BLURRED_DISTANCE = 0.02;
const CLOSE_DISTANCE = 0.03;
const SHOWN_PAIRS = 5;

function closestPairs(tone: Tone, scheme: ColorScheme) {
  const colors = markColors.map((option) => markColorIn(option, scheme, tone));
  const pairs = colors.flatMap((first, index) =>
    colors.slice(index + 1).map((second) => ({
      distance: colorDistance(first.color, second.color),
      first,
      second,
    }))
  );
  return pairs
    .toSorted((a, b) => a.distance - b.distance)
    .slice(0, SHOWN_PAIRS);
}

function distanceLabel(distance: number) {
  if (distance < BLURRED_DISTANCE) {
    return "見分けにくい";
  }
  if (distance < CLOSE_DISTANCE) {
    return "近い";
  }
  return "OK";
}

function DistinctTokens() {
  return (
    <Section
      description={`シフトの12色のうち、記号の色がいちばん近い組み合わせです。数値はOKLabでの色の差（ΔE）で、${CLOSE_DISTANCE}未満を「近い」、${BLURRED_DISTANCE}未満を「見分けにくい」としています。同じ月に並べて使うと、小さなマスでは区別しにくくなります。`}
      id="cp-distinct"
      title="見分けやすさ"
    >
      <div className="cp-distinct">
        {tones.map((tone) =>
          colorSchemes.map((scheme) => (
            <article
              className="cp-distinct-card"
              key={`${tone}-${scheme}`}
              style={themeStyle("moss", scheme, tone)}
            >
              <h3>
                {toneLabels[tone]}・{schemeLabels[scheme]}
              </h3>
              <ul>
                {closestPairs(tone, scheme).map(
                  ({ distance, first, second }) => (
                    <li
                      data-level={distanceLabel(distance)}
                      key={`${first.name}-${second.name}`}
                    >
                      {[first, second].map((mark) => (
                        <span
                          className="cp-mark-tile"
                          key={mark.name}
                          style={{ background: mark.tint, color: mark.color }}
                        >
                          {mark.name.slice(0, 1)}
                        </span>
                      ))}
                      <span className="cp-distinct-names">
                        {first.name}と{second.name}
                      </span>
                      <span className="cp-distinct-value">
                        {distance.toFixed(3)}
                        <small>{distanceLabel(distance)}</small>
                      </span>
                    </li>
                  )
                )}
              </ul>
            </article>
          ))
        )}
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
          { href: "#cp-dusty", number: "04", title: "テーマ（くすみ）" },
          { href: "#cp-marks", number: "05", title: "シフトの色" },
          { href: "#cp-distinct", number: "06", title: "見分けやすさ" },
        ].map(({ href, number, title }) => (
          <a href={href} key={href}>
            <span>{number}</span>
            {title}
          </a>
        ))}
      </nav>
      <NeutralTokens />
      <ThemeTokens tone="deep" id="cp-themes" />
      <ThemeTokens tone="pastel" id="cp-pastel" />
      <ThemeTokens tone="dusty" id="cp-dusty" />
      <MarkTokens />
      <DistinctTokens />
    </>
  );
}
