import type { ColorScheme } from "@pochical/design/colors";
import { presets } from "@pochical/design/themes";
import type { Preset } from "@pochical/design/themes";
import { useMotionValue } from "motion/react";
import { useContext, useState } from "react";
import { css, cva } from "styled-system/css";

import { useDevice } from "../lib/design-device";
import { isDayOff, presetPatterns, usePatterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { useLook, useSettings } from "../lib/design-settings-store";
import { dayName } from "../lib/text-limits";
import {
  ChoiceGrid,
  ChoiceTile,
  PageDots,
  Segment,
  SegmentedControl,
} from "./design-choices";
import { PageHeader } from "./design-header";
import { ListRow } from "./design-list";
import { Pager } from "./design-pager";
import { PresetContexts } from "./design-providers";
import { settingsParts } from "./design-settings-parts";
import { StylePreview, useOwnSamples } from "./design-settings-preview";
import type { StylePreviewData } from "./design-settings-preview";
import {
  ColorSchemeContext,
  deviceColorsPreset,
  presetOf,
  themeStyle,
} from "./design-theme";
import type { PresetId } from "./design-theme";
import { Section, srOnly } from "./design-ui";
import {
  CellNamesContext,
  IconWeightContext,
  MonochromeContext,
  ShiftMark,
  ShiftMarkStyleContext,
  useOffHighlight,
} from "./shift-mark";
import type { LookSettings, ShiftMarkStyle } from "./shift-mark";

// The スタイル page: how shifts are marked (shape, days off, names, the
// marks' colors) and the テーマ, each choice drawn on the person's own
// patterns.

// The four shapes members see. Icons come filled (塗り) or as outlines (線);
// letters always sit on their tile, and emoji have no fill.
const shapeOptions: { name: string; style: ShiftMarkStyle; fill: boolean }[] = [
  { fill: true, name: "塗り", style: "icon" },
  { fill: false, name: "線", style: "icon" },
  { fill: true, name: "絵文字", style: "emoji" },
  { fill: true, name: "文字", style: "badge" },
];

function shapeOf(look: LookSettings) {
  return (
    shapeOptions.find(
      (option) =>
        option.style === look.style &&
        (look.style !== "icon" || option.fill === look.fill)
    ) ?? shapeOptions[0]
  );
}

// Between pages, wider than between cards, so a swipe shows where one ends.
const THEME_PAGE_GAP = 16;

// The テーマ cards, three to a page of a pager with dots under it, as
// Telegram's 外観 shows its themes: the preview stays in sight while
// trying them, where a grid of four rows pushed the rest of スタイル
// down, and the dots tell there are more to the side.
const themeCard = {
  // A card on the screen, as the テーマ's lists and sheets sit on it.
  card: css({
    bg: "background.card",
    border: "1px solid token(colors.separator)",
    borderRadius: "sm",
    display: "flex",
    gap: "2px",
    justifyContent: "center",
    padding: "8px 2px",
  }),
  // 端末の色 on Android, in a row of its own over the others: its card in
  // the first of the three columns, and what it is beside it.
  deviceNote: css({
    alignSelf: "center",
    color: "text.tertiary",
    gridColumn: "span 2",
    lineHeight: 1.5,
    margin: 0,
    textStyle: "footnote",
  }),
  deviceRow: css({
    borderBottom: "1px solid token(colors.separator)",
    display: "grid",
    gap: "8px",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    marginBottom: "12px",
    paddingBottom: "12px",
  }),
  // One page: three across, as the grid had them.
  page: css({
    display: "grid",
    gap: "8px",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  }),
  pager: css({ border: 0, margin: 0, minWidth: 0, padding: 0 }),
  // The theme's own screen, in the current light or dark.
  sample: css({
    bg: "background.base",
    border: "1px solid token(colors.separator)",
    borderRadius: "lg",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "8px 8px 12px",
  }),
  // The テーマ's text and its fill side by side, so a colored ink, as
  // 喫茶's, shows beside its accent.
  strokes: css({
    "& span": { borderRadius: "full", height: "4px" },
    "& span:first-child": { bg: "text.primary", width: "20px" },
    "& span:last-child": { bg: "accent.fill", width: "28px" },
    display: "flex",
    gap: "4px",
    justifyContent: "center",
  }),
};

// 休みの見せ方 and シフト名 drawn as a day in small: its date, and the mark
// lit or not, with the name under it or not.
const offSample = cva({
  base: {
    "& small": { color: "text.secondary", fontSize: "9px", fontWeight: 600 },
    // The shift's name under the mark, smaller than the date. Its line is
    // one em tall, so it fits in what the box has left; at its normal height
    // the box squeezed it and lineClamp's overflow cut its letters off.
    "& small[data-part=name]": {
      fontSize: "7px",
      lineClamp: 1,
      lineHeight: "1",
      maxWidth: "100%",
      overflowWrap: "anywhere",
    },
    alignItems: "center",
    borderRadius: "sm",
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    height: "40px",
    paddingTop: "4px",
    width: "32px",
  },
  variants: { lit: { true: { bg: "calendar.offTint" } } },
});

export function MarkPage({
  preview,
  onBack,
}: {
  preview: StylePreviewData;
  onBack: () => void;
}) {
  const current = useContext(ShiftMarkStyleContext);
  // The テーマ cards show in the light or dark the preview's ☀︎ / ☾ picks,
  // without touching 外観.
  const scheme = useContext(ColorSchemeContext);
  const [picked, setPicked] = useState<ColorScheme>();
  const shown = picked ?? scheme;
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="スタイル" />
      <StylePreview preview={preview} shared={{ onPick: setPicked, shown }} />
      {/* Every choice shows in the preview at once, so there is nothing to
          confirm or cancel. Only the shape reaches the group, so it alone
          says so, under it as iOS puts a section's footer. */}
      <Section title="シフトの見た目">
        <ShapeChoices />
        <p className={settingsParts.footer}>
          グループの人にも、この見た目で表示されます。
        </p>
      </Section>
      <Section title="テーマ">
        <ThemeChoices scheme={shown} />
      </Section>
      {/* Emoji keep their own colors, so シフトの色 would change nothing;
          it comes back as it was with any other shape. */}
      {current !== "emoji" && (
        <Section title="シフトの色">
          <ShiftColorsChoices />
        </Section>
      )}
      <Section title="休みの見せ方">
        <OffLookChoices current={current} />
      </Section>
      <Section title="シフト名">
        <NamesChoices current={current} />
      </Section>
    </>
  );
}

// The switches for the look in use, as one list.
function ShapeChoices() {
  const { work } = useOwnSamples();
  const look = useLook();
  const setShape = useSettings((state) => state.setShape);
  const current = shapeOf(look);
  return (
    <SegmentedControl
      label="シフトの見た目"
      onValueChange={(name) => {
        const option = shapeOptions.find((item) => item.name === name);
        if (!option) {
          return;
        }
        // Only icons carry their fill; for the others it is left alone.
        setShape(
          option.style === "icon"
            ? { fill: option.fill, style: option.style }
            : { style: option.style }
        );
      }}
      value={current?.name ?? ""}
    >
      {shapeOptions.map((option) => (
        <Segment key={option.name} value={option.name}>
          <ShiftMarkStyleContext value={option.style}>
            <IconWeightContext value={option.fill ? "duotone" : "regular"}>
              <ShiftMark shift={work.id} size={20} />
            </IconWeightContext>
          </ShiftMarkStyleContext>
          {option.name}
        </Segment>
      ))}
    </SegmentedControl>
  );
}

// How your own calendar shows the marks. Group screens decide these for
// themselves, so members never see them.
const offLooks = [
  { blankOff: false, highlight: true, id: "highlight", name: "強調" },
  { blankOff: false, highlight: false, id: "mark", name: "印だけ" },
  { blankOff: true, highlight: false, id: "blank", name: "空白" },
] as const;

// How days off show, as the two settings that carry it.
export type OffLook = { highlight: boolean; blankOff: boolean };

function offLookId(value: OffLook) {
  if (value.blankOff) {
    return "blank";
  }
  return value.highlight ? "highlight" : "mark";
}

// Segments each drawing a day off as it would look. 空白 leaves
// days off empty on the month; they come back faint while entering and in
// the week view. Used by the style page and by the saved image, each with
// its own values; the image's names them alone (`samples` false), as the
// app's own look is not what it shows.
export function OffLookTabs({
  value,
  onChange,
  samples = true,
}: {
  value: OffLook;
  onChange: (value: OffLook) => void;
  samples?: boolean;
}) {
  const { off } = useOwnSamples();
  const picked = offLookId(value);
  return (
    <SegmentedControl
      label="休みの見せ方"
      onValueChange={(id) => {
        const option = offLooks.find((item) => item.id === id);
        if (option) {
          onChange({ blankOff: option.blankOff, highlight: option.highlight });
        }
      }}
      size={samples ? "tall" : "compact"}
      value={picked}
    >
      {offLooks.map((option) => (
        <Segment key={option.id} value={option.id}>
          {samples && (
            <span
              aria-hidden="true"
              className={offSample({ lit: option.highlight })}
            >
              <small>5</small>
              {option.blankOff ? null : <ShiftMark shift={off} size={18} />}
            </span>
          )}
          {option.name}
        </Segment>
      ))}
    </SegmentedControl>
  );
}

// Tabs like 休みの見せ方's, each drawing a working day with or without its
// name under the mark, or naming them alone as OffLookTabs's `samples`.
export function NameTabs({
  value,
  onChange,
  samples = true,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  samples?: boolean;
}) {
  const { work } = useOwnSamples();
  return (
    <SegmentedControl
      label="シフト名"
      onValueChange={(picked) => {
        onChange(picked === "true");
      }}
      size={samples ? "tall" : "compact"}
      value={String(value)}
    >
      {[false, true].map((withName) => (
        <Segment key={String(withName)} value={String(withName)}>
          {samples && (
            <span aria-hidden="true" className={offSample()}>
              <small>5</small>
              <ShiftMark shift={work.id} size={withName ? 16 : 18} />
              {withName && <small data-part="name">{dayName(work.name)}</small>}
            </span>
          )}
          {withName ? "あり" : "なし"}
        </Segment>
      ))}
    </SegmentedControl>
  );
}

function OffLookChoices({ current }: { current: ShiftMarkStyle }) {
  const look = useLook();
  const setCalendarOptions = useSettings((state) => state.setCalendarOptions);
  const highlight = useOffHighlight(current);
  return (
    <OffLookTabs
      onChange={setCalendarOptions}
      value={{ blankOff: look.blankOff, highlight }}
    />
  );
}

function NamesChoices({ current }: { current: ShiftMarkStyle }) {
  const { names } = useContext(CellNamesContext);
  const setCalendarOptions = useSettings((state) => state.setCalendarOptions);
  return (
    <NameTabs
      onChange={(withName) => {
        setCalendarOptions({ names: withName });
      }}
      value={names[current]}
    />
  );
}

// Like アプリアイコン's row, a look is shown rather than named: one of
// your own marks in the shape and テーマ in use, then the テーマ's name.
// Only the mark tells the shape, so it is spelled out for screen readers.
export function StyleRow({
  patternKeys,
  onOpen,
}: {
  patternKeys: Shift[];
  onOpen: () => void;
}) {
  const look = useLook();
  const book = usePatterns();
  const preset = presetOf(useSettings((state) => state.device.preset));
  const shift =
    patternKeys.find((key) => !isDayOff(book[key])) ?? presetPatterns.day.id;
  return (
    <ListRow
      label="スタイル"
      onClick={onOpen}
      value={
        <span className={settingsParts.inlineValue}>
          <ShiftMark shift={shift} size={20} />
          <span className={srOnly}>{shapeOf(look).name}・</span>
          {preset.name}
        </span>
      }
    />
  );
}

// シフトの色: each shift in its own color, or every shift in the テーマ's
// one. It carries meaning, telling shifts apart at a glance, so it is a
// choice of its own rather than part of a テーマ. Tabs like 休みの見せ方's
// rather than a switch, so each side shows its look in the テーマ in use:
// ワントーン under 墨 is the shifts in ink, which a switch's words could not
// show. The テーマ cards follow it too.
const shiftColorOptions = [
  { colored: true, name: "色分け" },
  { colored: false, name: "ワントーン" },
] as const;

const shiftColorSample = css({
  alignItems: "center",
  display: "flex",
  gap: "4px",
  height: "40px",
});

function ShiftColorsChoices() {
  const { week } = useOwnSamples();
  const shiftColors = useSettings((state) => state.device.shiftColors);
  const setShiftColors = useSettings((state) => state.setShiftColors);
  return (
    <SegmentedControl
      label="シフトの色"
      onValueChange={(picked) => {
        setShiftColors(picked === "true");
      }}
      size="tall"
      value={String(shiftColors)}
    >
      {shiftColorOptions.map((option) => (
        <Segment key={option.name} value={String(option.colored)}>
          <span aria-hidden="true" className={shiftColorSample}>
            <MonochromeContext value={{ monochrome: !option.colored }}>
              {week.map((shift) => (
                <ShiftMark key={shift} shift={shift} size={18} />
              ))}
            </MonochromeContext>
          </span>
          {option.name}
        </Segment>
      ))}
    </SegmentedControl>
  );
}

type ThemeOption = Preset & { id: PresetId };

// The テーマ in rows of three, each row a page: the basics, the soft ones,
// the colors, the nights.
const themePages: ThemeOption[][] = Array.from(
  { length: Math.ceil(presets.length / 3) },
  (_, page) => presets.slice(page * 3, page * 3 + 3)
);

// Each テーマ as a small screen: its ground, a card on it with shifts in
// its colors, and strokes of its text and its fill, so where each テーマ
// puts color tells apart at a glance. The one in use sits on a gray card,
// as app icons do.
function ThemeChoices({ scheme }: { scheme: ColorScheme }) {
  const current = useSettings((state) => state.device.preset);
  const setPreset = useSettings((state) => state.setPreset);
  // On Android, 端末の色 sits in a row of its own over the pages, as
  // Android's own color settings keep the colors it takes from the
  // wallpaper apart from the basic ones.
  const { platform, wallpaperHue } = useDevice();
  const deviceColors =
    platform === "android" ? deviceColorsPreset(wallpaperHue) : undefined;
  // Opens on the page of the テーマ in use.
  const [page, setPage] = useState(() =>
    Math.max(
      themePages.findIndex((themes) =>
        themes.some((preset) => preset.id === current)
      ),
      0
    )
  );
  const progress = useMotionValue(0);
  return (
    <>
      <ChoiceGrid
        className={themeCard.pager}
        label="テーマ"
        onValueChange={setPreset}
        value={current}
      >
        {deviceColors && (
          <div className={themeCard.deviceRow}>
            <ThemeChoice preset={deviceColors} scheme={scheme} />
            <p className={themeCard.deviceNote}>
              Android で設定されている色に合わせます。
            </p>
          </div>
        )}
        <Pager
          ends={{ back: page > 0, forward: page < themePages.length - 1 }}
          gap={THEME_PAGE_GAP}
          onStep={(direction) => {
            setPage((shown) => shown + direction);
          }}
          page={String(page)}
          progress={progress}
          renderPage={(offset) => {
            const themes = themePages[page + offset];
            return (
              themes && (
                <div className={themeCard.page}>
                  {themes.map((preset) => (
                    <ThemeChoice
                      key={preset.id}
                      preset={preset}
                      scheme={scheme}
                    />
                  ))}
                </div>
              )
            );
          }}
        />
      </ChoiceGrid>
      <PageDots
        count={themePages.length}
        current={page}
        label="テーマのページ"
        onPick={setPage}
        progress={progress}
      />
    </>
  );
}

function ThemeChoice({
  preset,
  scheme,
}: {
  preset: ThemeOption;
  scheme: ColorScheme;
}) {
  const { week } = useOwnSamples();
  return (
    <ChoiceTile size="small" value={preset.id}>
      <span
        aria-hidden="true"
        className={themeCard.sample}
        style={themeStyle(preset.id, scheme)}
      >
        <ColorSchemeContext value={scheme}>
          <PresetContexts id={preset.id}>
            <span className={themeCard.card}>
              {week.map((shift) => (
                <ShiftMark key={shift} shift={shift} size={14} />
              ))}
            </span>
          </PresetContexts>
        </ColorSchemeContext>
        <span className={themeCard.strokes}>
          <span />
          <span />
        </span>
      </span>
      {preset.name}
    </ChoiceTile>
  );
}
