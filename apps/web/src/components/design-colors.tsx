import type { ColorScheme, ColorToken } from "@pochical/design/colors";
import {
  colorSchemes,
  markColorIn,
  markColors,
  neutralTokenGroups,
} from "@pochical/design/colors";
import { hexToOklch } from "@pochical/design/oklch";
import { presets, themeColors, themeRoleTokens } from "@pochical/design/themes";
import type { Preset } from "@pochical/design/themes";
import type { ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

import { firstCharacter } from "../lib/text-limits";
import { themeStyle } from "./design-theme";

const schemeLabels: Record<ColorScheme, string> = {
  dark: "ダーク",
  light: "ライト",
};

const textTokens = new Set([
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "text-quaternary",
  "text-disabled",
  "calendar-holiday",
  "calendar-saturday",
  "danger-default",
]);
const onMediaBlack = new Set(["media-fill", "media-fill-faint"]);
const lineTokens = new Set(["border-default", "separator", "border-strong"]);

// The grays a theme tints, from the screen down to the darkest text.
const grayRoles = [
  "background-base",
  "fill-quaternary",
  "fill-tertiary",
  "fill-secondary",
  "fill-primary",
  "border-strong",
  "text-tertiary",
  "text-primary",
];

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

// /design/colors: the palette page. Each cell sets its own light or dark
// variables, so the samples sit on the real screen's ground.
const palette = {
  block: css({
    border: "1px solid token(colors.separator)",
    borderRadius: "10px",
    display: "inline-grid",
    flexShrink: 0,
    fontSize: "11px",
    fontWeight: 600,
    height: "36px",
    placeItems: "center",
    width: "64px",
  }),
  cell: css({
    "& > code": { color: "text.tertiary", fontSize: "11px" },
    alignItems: "center",
    bg: "background.base",
    borderTop: "1px solid token(colors.separator)",
    color: "text.primary",
    display: "flex",
    gap: "12px",
    height: "100%",
    minHeight: "64px",
    padding: "12px 16px",
  }),
  distinct: css({
    display: "grid",
    gap: "16px",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  }),
  distinctCard: css({
    "& > ul": {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      listStyle: "none",
      marginTop: "12px",
      padding: 0,
    },
    "& li": {
      alignItems: "center",
      display: "flex",
      fontSize: "12px",
      gap: "6px",
    },
    bg: "background.base",
    border: "1px solid token(colors.separator)",
    borderRadius: "16px",
    color: "text.primary",
    padding: "16px",
  }),
  distinctNames: css({ color: "text.secondary", marginLeft: "4px" }),
  // How far apart two marks are, badged green, gray when close and red
  // when hard to tell apart.
  distinctValue: css({
    "& > small": {
      bg: "accent.container",
      borderRadius: "6px",
      color: "accent.default",
      fontSize: "9px",
      fontWeight: 600,
      padding: "1px 6px",
    },
    '&[data-level="見分けにくい"] > small': {
      bg: "danger.default",
      color: "var(--danger-on-fill)",
    },
    '&[data-level="近い"] > small': {
      bg: "fill.tertiary",
      color: "text.secondary",
    },
    alignItems: "baseline",
    color: "text.tertiary",
    display: "inline-flex",
    fontSize: "11px",
    fontVariantNumeric: "tabular-nums",
    gap: "6px",
    marginLeft: "auto",
  }),
  grays: css({
    "& > ul": {
      border: "1px solid token(colors.separator)",
      borderRadius: "8px",
      display: "flex",
      height: "28px",
      listStyle: "none",
      overflow: "hidden",
      padding: 0,
    },
    "& li": { flex: 1 },
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    marginTop: "12px",
  }),
  group: css({ "& + &": { marginTop: "36px" } }),
  lineSample: css({
    borderTopWidth: "2px",
    flexShrink: 0,
    height: 0,
    width: "64px",
  }),
  markChip: css({ alignItems: "center", display: "flex", gap: "12px" }),
  marks: css({
    display: "grid",
    gap: "28px 20px",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  }),
  markTile: cva({
    base: {
      display: "grid",
      flexShrink: 0,
      fontWeight: 700,
      placeItems: "center",
    },
    variants: {
      size: {
        large: {
          borderRadius: "11px",
          fontSize: "17px",
          height: "40px",
          width: "40px",
        },
        small: {
          borderRadius: "8px",
          fontSize: "13px",
          height: "30px",
          width: "30px",
        },
      },
    },
  }),
  markValues: css({
    "& > code": { color: "text.tertiary", fontSize: "11px" },
    "& > small": { color: "text.quaternary", fontSize: "10px" },
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  }),
  roleList: css({
    "& code": { color: "text.primary", marginRight: "6px" },
    color: "text.tertiary",
    display: "flex",
    flexWrap: "wrap",
    fontSize: "11px",
    gap: "6px 16px",
    marginBottom: "20px",
  }),
  section: css({
    "& > h2": { fontSize: "20px", fontWeight: 500, letterSpacing: "0.04em" },
    margin: "72px auto 0",
    maxWidth: "1100px",
  }),
  sectionDescription: css({
    color: "text.tertiary",
    fontSize: "13px",
    lineHeight: "1.8",
    margin: "8px 0 28px",
    maxWidth: "640px",
  }),
  // Cards stacked into one, light over dark: rounded only at the ends.
  stacked: css({
    "& + &": { borderTop: 0 },
    "&:first-of-type": { borderRadius: "16px 16px 0 0" },
    "&:last-of-type": { borderRadius: "0 0 16px 16px" },
    bg: "background.base",
    border: "1px solid token(colors.separator)",
    color: "text.primary",
    padding: "16px",
  }),
  // A group's, a theme's or a mark's name over its samples.
  subheading: css({
    color: "text.secondary",
    fontSize: "13px",
    fontWeight: 600,
    marginBottom: "12px",
  }),
  swatch: css({
    border: "1px solid token(colors.separator)",
    borderRadius: "8px",
    height: "28px",
  }),
  swatchLabel: css({ color: "text.secondary", fontSize: "10px" }),
  swatches: css({
    "& > li": { display: "flex", flexDirection: "column", gap: "3px" },
    "& code": { color: "text.tertiary", fontSize: "11px" },
    display: "grid",
    gap: "10px 8px",
    gridTemplateColumns: "repeat(3, 1fr)",
    listStyle: "none",
    padding: 0,
  }),
  // The neutral tokens' table: each row's name, then the token in light
  // and in dark, each cell filling its row.
  table: css({
    // A nominal height lets a cell fill the row with height: 100%.
    "& th, & td": {
      height: "1px",
      padding: 0,
      textAlign: "left",
      verticalAlign: "middle",
    },
    "& tbody th": {
      bg: "var(--ws-bg)",
      borderTop: "1px solid token(colors.separator)",
      color: "text.tertiary",
      fontSize: "12px",
      fontWeight: 400,
      padding: "14px 16px",
    },
    "& tbody th code": {
      color: "text.primary",
      display: "block",
      fontSize: "13px",
      marginBottom: "4px",
    },
    "& thead th": {
      bg: "fill.quaternary",
      color: "text.quaternary",
      fontSize: "11px",
      fontWeight: 400,
      letterSpacing: "0.08em",
      padding: "10px 16px",
      width: "36%",
    },
    "& thead th:first-child": { width: "28%" },
    border: "1px solid token(colors.border.default)",
    borderRadius: "16px",
    borderSpacing: 0,
    overflow: "hidden",
    width: "100%",
  }),
  textSample: css({
    flexShrink: 0,
    fontSize: "15px",
    fontWeight: 600,
    width: "64px",
  }),
  themeButton: css({
    bg: "accent.fill",
    borderRadius: "18px",
    color: "accent.onFill",
    padding: "8px 14px",
  }),
  themeChip: css({
    bg: "accent.container",
    border: "1px solid token(colors.accent.border)",
    borderRadius: "10px",
    color: "accent.default",
    padding: "7px 12px",
  }),
  themeContrast: css({
    alignItems: "center",
    color: "text.tertiary",
    display: "flex",
    flexWrap: "wrap",
    fontSize: "11px",
    gap: "4px 10px",
    marginTop: "14px",
  }),
  themeLink: css({ color: "accent.focus" }),
  themePreview: css({
    alignItems: "center",
    display: "flex",
    fontSize: "12px",
    fontWeight: 600,
    gap: "10px",
    marginBottom: "14px",
  }),
  themes: css({
    display: "grid",
    gap: "28px 20px",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  }),
};

// A contrast ratio and its grade, green when it passes; at the end of its
// row, or inline in a sentence.
const contrastBadge = cva({
  base: {
    "& > small": {
      bg: "fill.tertiary",
      borderRadius: "6px",
      color: "text.quaternary",
      fontSize: "9px",
      fontWeight: 600,
      padding: "1px 5px",
    },
    "&[data-pass=true] > small": {
      bg: "accent.container",
      color: "accent.default",
    },
    alignItems: "baseline",
    color: "text.tertiary",
    display: "inline-flex",
    fontSize: "11px",
    fontVariantNumeric: "tabular-nums",
    gap: "4px",
    marginLeft: "auto",
  },
  variants: { inline: { true: { marginLeft: 0 } } },
});

function ContrastBadge({
  ratio,
  inline = false,
}: {
  ratio: number;
  inline?: boolean;
}) {
  const grade = contrastGrade(ratio);
  return (
    <span className={contrastBadge({ inline })} data-pass={grade !== "—"}>
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
      <span className={palette.textSample} style={{ color }}>
        Aa あ 12
      </span>
    );
  }
  if (lineTokens.has(token.name)) {
    return (
      <span
        className={palette.lineSample}
        style={{
          borderColor: color,
          borderStyle: token.name === "border-strong" ? "dashed" : "solid",
        }}
      />
    );
  }
  // Words on a filled ground, shown on that ground.
  const ground = {
    "danger-on-fill": "var(--danger-fill)",
    "inverse-text": "var(--inverse-background)",
    "media-text": "var(--media-background)",
    "media-text-secondary": "var(--media-background)",
    "media-warning": "var(--media-background)",
  }[token.name];
  if (ground !== undefined) {
    return (
      <span className={palette.block} style={{ background: ground, color }}>
        完了
      </span>
    );
  }
  // White laid over the camera's black, shown on that black; the black
  // laid over a photo shows on the page's own ground.
  if (onMediaBlack.has(token.name)) {
    return (
      <span
        className={palette.block}
        style={{
          background: `linear-gradient(${color}, ${color}), var(--media-background)`,
        }}
      />
    );
  }
  if (token.name.startsWith("shadow")) {
    return (
      <span
        className={palette.block}
        style={{ boxShadow: `0 6px 16px ${color}` }}
      />
    );
  }
  return <span className={palette.block} style={{ background: color }} />;
}

function TokenCell({
  scheme,
  token,
}: {
  scheme: ColorScheme;
  token: ColorToken;
}) {
  const value = token[scheme];
  const ground = valueOf(scheme, "background-base");
  return (
    <div className={palette.cell} style={themeStyle("pochical", scheme)}>
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
    <section aria-labelledby={id} className={palette.section}>
      <h2 id={id}>{title}</h2>
      <p className={palette.sectionDescription}>{description}</p>
      {children}
    </section>
  );
}

function NeutralTokens() {
  return (
    <Section
      description="役割ごとの色です。画面はこの名前の変数だけを使います。文字の色には、画面の背景に対するコントラスト比を添えています。"
      id="cp-neutral"
      title="基本色"
    >
      {neutralTokenGroups.map((group) => (
        <div className={palette.group} key={group.label}>
          <h3 className={palette.subheading}>{group.label}</h3>
          <table className={palette.table}>
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
                  <th scope="row">
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
  scheme,
  preset,
}: {
  scheme: ColorScheme;
  preset: (typeof presets)[number];
}) {
  const colors = themeColors(preset, scheme);
  return (
    <div className={palette.stacked} style={themeStyle(preset.id, scheme)}>
      <div className={palette.themePreview}>
        <span className={palette.themeButton}>完了</span>
        <span className={palette.themeChip}>選択中</span>
        <span className={palette.themeLink}>月で見る</span>
      </div>
      <ul className={palette.swatches}>
        {themeRoleTokens.map((role) => (
          <li key={role.key}>
            <span
              aria-hidden="true"
              className={palette.swatch}
              style={{ background: colors[role.key] }}
            />
            <span className={palette.swatchLabel}>{role.label}</span>
            <code>{colors[role.key]}</code>
          </li>
        ))}
      </ul>
      <div className={palette.grays}>
        <span className={palette.swatchLabel}>グレー</span>
        <ul>
          {grayRoles.map((name) => (
            <li
              key={name}
              style={{ background: `var(--${name})` }}
              title={`--${name}`}
            />
          ))}
        </ul>
      </div>
      <p className={palette.themeContrast}>
        文字と背景の比{" "}
        <ContrastBadge
          inline
          ratio={contrast(colors.accent, valueOf(scheme, "background-base"))}
        />
        塗りと文字の比{" "}
        <ContrastBadge inline ratio={contrast(colors.onFill, colors.fill)} />
      </p>
    </div>
  );
}

// How a テーマ draws shifts when シフトの色 is 色分け.
function marksLabel(preset: Preset) {
  return (preset.vividness ?? 1) === 1
    ? "シフトの色はそのまま"
    : "シフトの色はやわらか";
}

function ThemeTokens() {
  return (
    <Section
      description="設定で選べる9つのテーマです。それぞれ、テーマの色（色相・鮮やかさ・明るさ）とグレーの寄せ方、地の色、シフトの描き方だけを持ち、残りの色はすべて同じ段で作ります。ライトは明るさの段差と鮮やかさの割合、ダークはどのテーマも同じ明るさです。どのテーマでも同じ役割の変数（--accent-default など）に入り、画面の組み方は変わりません。"
      id="cp-themes"
      title="テーマ"
    >
      <p className={palette.roleList}>
        {themeRoleTokens.map((role) => (
          <span key={role.key}>
            <code>--{role.name}</code>
            {role.label}
          </span>
        ))}
      </p>
      <div className={palette.themes}>
        {presets.map((preset) => (
          <article key={preset.id}>
            <h3 className={palette.subheading}>
              {preset.name}
              <small>{marksLabel(preset)}</small>
            </h3>
            <ThemePalette preset={preset} scheme="light" />
            <ThemePalette preset={preset} scheme="dark" />
          </article>
        ))}
      </div>
    </Section>
  );
}

// The shift colors as the colorful テーマ draw them: as tuned, or softened.
const markLevels = [
  ...new Set(presets.map((preset: Preset) => preset.vividness ?? 1)),
].map((vividness) => ({
  label: presets
    .filter((preset: Preset) => (preset.vividness ?? 1) === vividness)
    .map((preset) => preset.name)
    .join("・"),
  vividness,
}));

function MarkChip({
  level,
  option,
  scheme,
}: {
  level: (typeof markLevels)[number];
  option: (typeof markColors)[number];
  scheme: ColorScheme;
}) {
  const { color, tint } = markColorIn(option, scheme, level.vividness);
  return (
    <div
      className={cx(palette.stacked, palette.markChip)}
      style={themeStyle("pochical", scheme)}
    >
      <span
        className={palette.markTile({ size: "large" })}
        style={{ background: tint, color }}
      >
        {firstCharacter(option.name)}
      </span>
      <span className={palette.markValues}>
        <small>
          {level.label}・{schemeLabels[scheme]}
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
      description="シフトごとに選べる12色です。濃い色は記号と文字、薄い色はその地に使います。比は記号の色と地の色のコントラストです。1番目はテーマの色で、テーマごとに変わります。やわらかなテーマは、明るさを保ったまま鮮やかさを落とします。"
      id="cp-marks"
      title="シフトの色"
    >
      <div className={palette.marks}>
        {markColors.map((option) => (
          <article key={option.name}>
            <h3 className={palette.subheading}>{option.name}</h3>
            {markLevels.map((level) =>
              colorSchemes.map((scheme) => (
                <MarkChip
                  key={`${level.vividness}-${scheme}`}
                  level={level}
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

function closestPairs(vividness: number, scheme: ColorScheme) {
  const colors = markColors.map((option) =>
    markColorIn(option, scheme, vividness)
  );
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
      <div className={palette.distinct}>
        {markLevels.map((level) =>
          colorSchemes.map((scheme) => (
            <article
              className={palette.distinctCard}
              key={`${level.vividness}-${scheme}`}
              style={themeStyle("pochical", scheme)}
            >
              <h3>
                {level.label}・{schemeLabels[scheme]}
              </h3>
              <ul>
                {closestPairs(level.vividness, scheme).map(
                  ({ distance, first, second }) => (
                    <li key={`${first.name}-${second.name}`}>
                      {[first, second].map((mark) => (
                        <span
                          className={palette.markTile({ size: "small" })}
                          key={mark.name}
                          style={{ background: mark.tint, color: mark.color }}
                        >
                          {firstCharacter(mark.name)}
                        </span>
                      ))}
                      <span className={palette.distinctNames}>
                        {first.name}と{second.name}
                      </span>
                      <span
                        className={palette.distinctValue}
                        data-level={distanceLabel(distance)}
                      >
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

// The page's sections, as pills to jump to.
const contents = css({
  "& a": {
    _hover: { bg: "accent.hover" },
    border: "1px solid token(colors.border.default)",
    borderRadius: "24px",
    color: "accent.default",
    fontSize: "12px",
    padding: "10px 16px",
  },
  "& a > span": {
    color: "text.quaternary",
    fontSize: "10px",
    marginRight: "8px",
  },
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  justifyContent: "center",
  margin: "-20px auto 44px",
});

export function DesignColors() {
  return (
    <>
      <nav aria-label="このページの内容" className={contents}>
        {[
          { href: "#cp-neutral", number: "01", title: "基本色" },
          { href: "#cp-themes", number: "02", title: "テーマ" },
          { href: "#cp-marks", number: "03", title: "シフトの色" },
          { href: "#cp-distinct", number: "04", title: "見分けやすさ" },
        ].map(({ href, number, title }) => (
          <a href={href} key={href}>
            <span>{number}</span>
            {title}
          </a>
        ))}
      </nav>
      <NeutralTokens />
      <ThemeTokens />
      <MarkTokens />
      <DistinctTokens />
    </>
  );
}
