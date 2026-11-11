import { ShiftMark } from "@pochical/prototype/components/shift-mark";
import { presetPatterns } from "@pochical/prototype/lib/design-patterns";
import {
  FEATURE_GRAPHIC,
  HEADLINE_SHARE,
  PIECES_TALL,
  SITE_WALL,
  STORE_SHOTS,
  STORES,
  WALL,
  wallOf,
} from "@pochical/prototype/lib/store-shots";
import type {
  Piece,
  StoreId,
  WallPin,
} from "@pochical/prototype/lib/store-shots";
import { css, cx } from "@pochical/styled-system/css";
import { createFileRoute } from "@tanstack/react-router";

import { pageMeta } from "../../../lib/page-meta";
import {
  PictureBrand,
  PictureSky,
  pictureTitle,
} from "../../../lib/site-picture";

// One of the stores' pictures (#806), which pnpm run image:store takes
// from /_render/store-shot into store/: a screen of the real app, with
// rounded corners and no phone around it, on the site's sky under its
// headline, at the size its store asks for
// (@pochical/prototype's lib/store-shots.ts). `?store=ios&shot=calendar`
// names the picture, `shot=feature-graphic` Google Play's feature graphic
// and `shot=widget-wall` the wall of widgets as the site's top page shows
// it, with no headline and no sky.
// The screens are not in the app: the script answers /_render/store-raw/
// with the files the platform's UI test photographed, and names the
// widgets it found for the wall in `widgets`.

const RAW = "/_render/store-raw/";

const isStore = (value: unknown): value is StoreId =>
  typeof value === "string" && Object.hasOwn(STORES, value);

export const Route = createFileRoute("/_tool/_render/store-shot")({
  component: StoreShotPage,
  head: () => pageMeta("ストアの画像", "ストアに載せる、ポチカルの画像"),
  validateSearch: (search: Record<string, unknown>) => ({
    // Each tile's ground, the color its part of a screen lies on, as six
    // hex digits, with commas between them.
    grounds: typeof search.grounds === "string" ? search.grounds : "",
    // How tall each tile's part is in its widths, with commas between them.
    parts: typeof search.parts === "string" ? search.parts : "",
    shot: typeof search.shot === "string" ? search.shot : "",
    store: isStore(search.store) ? search.store : "ios",
    // The wall's widgets' files, each in every look's folder, with commas
    // between them.
    widgets: typeof search.widgets === "string" ? search.widgets : "",
  }),
});

// Every length but the headline's room is in --u, a hundredth of the
// picture's width, so each store's picture is laid out alike at its size.
// The width of a widget's cell on the wall, in them.
const WIDGET_CELL = "calc(var(--u) * 25)";

// A shot of tiles, in --u: its words' size, line and the room under them,
// the gap from a tile to the next one's words, several times that room so
// that words read as their own tile's, the room at the picture's foot,
// the room a tile's card keeps around what it holds, and how wide a tile
// is at most: as the phone is in the App Store's pictures of one screen,
// the sky at its sides. Google Play's phone is narrower than a line of
// words, so its tiles keep to the same width.
const TILES = {
  foot: 5,
  gap: 8,
  line: 1.3,
  pad: 4.25,
  under: 1.6,
  widest: 78,
  words: 4.8,
};

// How wide the tiles are, in --u: as wide as lets them all, each holding
// a part as tall as `parts` says in its widths, fit under the headline of
// a picture `tall` times as tall as it is wide.
const tileWidth = (parts: number[], tall: number): number => {
  const room =
    100 * tall * (1 - HEADLINE_SHARE) -
    TILES.foot -
    TILES.gap * (parts.length - 1) -
    (TILES.words * TILES.line + TILES.under + 2 * TILES.pad) * parts.length;
  const tallness = parts.reduce((sum, part) => sum + part, 0);
  return Math.min(TILES.widest, room / tallness + 2 * TILES.pad);
};

const styles = {
  feature: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "28px",
    justifyContent: "center",
    position: "relative",
  }),
  featureTitle: css({ fontSize: "84px", position: "relative" }),
  headline: css({
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    fontSize: "calc(var(--u) * 8.6)",
    height: "var(--headline)",
    justifyContent: "center",
    paddingTop: "calc(var(--u) * 4)",
    position: "relative",
    textAlign: "center",
    whiteSpace: "nowrap",
    zIndex: 1,
  }),
  line: css({ display: "block" }),
  // Two screens, the second over the first's corner and lower.
  pairFirst: css({
    left: "calc(var(--u) * 4)",
    position: "absolute",
    top: 0,
    width: "calc(var(--u) * 57)",
  }),
  pairSecond: css({
    bottom: "calc(var(--u) * 5)",
    position: "absolute",
    right: "calc(var(--u) * 4)",
    width: "calc(var(--u) * 57)",
  }),
  root: css({
    bg: "var(--paper)",
    color: "var(--ink)",
    overflow: "hidden",
    position: "relative",
  }),
  // A screen as the phone shows it: its corners rounded, nothing around it.
  screen: css({
    borderRadius: "calc(var(--u) * 9)",
    boxShadow:
      "0 calc(var(--u) * 2) calc(var(--u) * 7) rgba(60, 70, 60, 0.2), 0 0 0 1px rgba(60, 70, 60, 0.08)",
    display: "block",
  }),
  single: css({ height: "100%", width: "auto" }),
  // Under the headline, to the picture's foot.
  stage: css({
    boxSizing: "border-box",
    display: "flex",
    inset: "var(--headline) 0 0",
    justifyContent: "center",
    paddingBottom: "calc(var(--u) * 5)",
    position: "absolute",
  }),
  // A tile's card, as a widget on the wall is, on the ground of what it
  // holds, with room around it.
  tileCard: css({
    "& img": { display: "block", width: "100%" },
    borderRadius: "calc(var(--u) * 4.25)",
    boxShadow:
      "0 calc(var(--u) * 1) calc(var(--u) * 3.5) rgba(60, 70, 60, 0.2)",
    padding: `calc(var(--u) * ${TILES.pad})`,
  }),
  tileWords: css({
    fontSize: `calc(var(--u) * ${TILES.words})`,
    fontWeight: 700,
    lineHeight: TILES.line,
    paddingBottom: `calc(var(--u) * ${TILES.under})`,
    paddingLeft: "calc(var(--u) * 1.5)",
    whiteSpace: "nowrap",
  }),
  // The tiles one over the other, each as tall as its part is, together in
  // the middle of the room under the headline.
  tiles: css({
    "& figure": { margin: 0 },
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: `calc(var(--u) * ${TILES.gap})`,
    inset: `var(--headline) 0 calc(var(--u) * ${TILES.foot})`,
    justifyContent: "center",
    position: "absolute",
  }),
  // The widgets on a Home Screen's grid, tilted, running off every edge
  // and fading into the sky under the headline.
  wall: css({
    inset: 0,
    maskImage:
      "linear-gradient(to bottom, transparent calc(var(--headline) * 0.8), black calc(var(--headline) * 1.25))",
    position: "absolute",
  }),
  wallGrid: css({
    display: "grid",
    gap: "calc(var(--u) * 3.5)",
    left: "50%",
    position: "absolute",
    top: "54%",
    transform: "translate(-50%, -50%) rotate(-12deg)",
  }),
  // A widget's photograph holds the wallpaper beyond its corners, which
  // are rounder toward their ends than a circle's: its frame's corners
  // are a little wider than the widget's, and the photograph a little
  // larger than its frame.
  widget: css({
    "& img": {
      display: "block",
      height: "100%",
      objectFit: "cover",
      transform: "scale(1.02)",
      width: "100%",
    },
    borderRadius: "calc(var(--u) * 4.25)",
    boxShadow:
      "0 calc(var(--u) * 1) calc(var(--u) * 3.5) rgba(60, 70, 60, 0.2)",
    overflow: "hidden",
  }),
};

function StoreShotPage() {
  const { grounds, parts, shot: name, store, widgets } = Route.useSearch();
  if (name === FEATURE_GRAPHIC.name) {
    return <FeatureGraphic />;
  }
  const site = name === SITE_WALL.name;
  const shot = STORE_SHOTS.find(
    (one) => one.name === (site ? SITE_WALL.shot : name)
  );
  if (shot === undefined) {
    return <p>No shot is named {name}.</p>;
  }
  const { widgetRow } = STORES[store];
  const { height, width } = site ? SITE_WALL : STORES[store];
  return (
    <div
      className={styles.root}
      data-store-shot
      style={{
        "--headline": `${site ? 0 : height * HEADLINE_SHARE}px`,
        "--u": `${width / 100}px`,
        height,
        width,
      }}
    >
      {!site && <PictureSky height="100%" />}
      {shot.kind === "wall" && (
        <Wall
          alike={shot.alike}
          looks={shot.raw}
          pinned={shot.pinned}
          row={widgetRow}
          widgets={widgets.split(",").filter(Boolean)}
        />
      )}
      {!site && (
        <h1 className={cx(pictureTitle, styles.headline)}>
          <span>
            {shot.headline.map((line) => (
              <span className={styles.line} key={line}>
                {line}
              </span>
            ))}
          </span>
        </h1>
      )}
      {shot.kind === "screen" && (
        <div className={styles.stage}>
          <img
            alt=""
            className={cx(styles.screen, styles.single)}
            src={RAW + shot.raw}
          />
        </div>
      )}
      {shot.kind === "tiles" && (
        <Tiles
          grounds={grounds.split(",")}
          tiles={shot.tiles}
          unit={width / 100}
          wide={tileWidth(parts.split(",").map(Number), height / width)}
        />
      )}
      {shot.kind === "pair" && (
        <div className={styles.stage}>
          <img
            alt=""
            className={cx(styles.screen, styles.pairFirst)}
            src={RAW + shot.raw[0]}
          />
          <img
            alt=""
            className={cx(styles.screen, styles.pairSecond)}
            src={RAW + shot.raw[1]}
          />
        </div>
      )}
    </div>
  );
}

// The tiles, each `wide` hundredths of the picture across: its words over
// its card, which holds its part of a screen or its pieces. `unit` is a
// hundredth of the picture's width in pixels.
function Tiles({
  grounds,
  tiles,
  unit,
  wide,
}: {
  grounds: string[];
  tiles: (typeof STORE_SHOTS)[number] extends infer Shot
    ? Shot extends { tiles: infer Held }
      ? Held
      : never
    : never;
  unit: number;
  wide: number;
}) {
  return (
    <div className={styles.tiles}>
      {tiles.map((tile, index) => (
        <figure key={tile.words} style={{ width: `calc(var(--u) * ${wide})` }}>
          <figcaption className={styles.tileWords}>{tile.words}</figcaption>
          <div
            className={styles.tileCard}
            style={{ background: `#${grounds[index] ?? "ffffff"}` }}
          >
            {"raw" in tile ? (
              <img alt="" src={RAW + tile.raw} />
            ) : (
              <Pieces
                pieces={tile.pieces}
                tall={(wide - 2 * TILES.pad) * PIECES_TALL * unit}
              />
            )}
          </div>
        </figure>
      ))}
    </div>
  );
}

const piece = {
  // A day of the calendar: its date over its mark.
  day: css({
    alignItems: "center",
    bg: "rgba(60, 70, 60, 0.06)",
    borderRadius: "16%",
    display: "flex",
    flexDirection: "column",
    fontWeight: 700,
    justifyContent: "space-evenly",
    position: "relative",
  }),
  // ポチポチ入力's key: the shift's mark over its name, on a card.
  key: css({
    alignItems: "center",
    bg: "white",
    borderRadius: "18%",
    boxShadow:
      "0 0 0 1px rgba(60, 70, 60, 0.14), 0 2px 10px rgba(60, 70, 60, 0.16)",
    display: "flex",
    flexDirection: "column",
    fontWeight: 600,
    justifyContent: "center",
    position: "relative",
  }),
  // The line from a day's word to its mark's corner.
  line: css({ bg: "var(--ink)", opacity: 0.55, position: "absolute" }),
  row: css({
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
  }),
  // A word pointing at a mark's corner, beside the day.
  says: css({ fontWeight: 700, position: "absolute", whiteSpace: "nowrap" }),
  // A word pinned to a day's corner, in the picture's ink.
  tag: css({
    bg: "var(--ink)",
    borderRadius: "999px",
    color: "white",
    fontWeight: 700,
    position: "absolute",
    whiteSpace: "nowrap",
  }),
  // Where the key is pressed: a finger's round touch.
  tap: css({
    bg: "rgba(60, 70, 60, 0.18)",
    border: "2px solid rgba(60, 70, 60, 0.45)",
    borderRadius: "50%",
    position: "absolute",
  }),
};

// A tile's pieces in a row `tall` pixels high, drawn from the app's own
// marks: what is the picture's own, the arrow, the touch, the words and
// their lines, is in its ink.
function Pieces({ pieces, tall }: { pieces: readonly Piece[]; tall: number }) {
  const high = tall * 0.84;
  return (
    <div className={piece.row} style={{ gap: tall * 0.16, height: tall }}>
      {pieces.map((one, index) => {
        if (one.kind === "then") {
          return (
            <svg
              aria-hidden="true"
              height={tall * 0.3}
              // oxlint-disable-next-line react/no-array-index-key -- a row that never changes
              key={index}
              viewBox="0 0 40 30"
              width={tall * 0.4}
            >
              <path
                d="M3 15h32m-11-10 11 10-11 10"
                fill="none"
                stroke="var(--ink)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3.5"
              />
            </svg>
          );
        }
        const mark = high * 0.46;
        if (one.kind === "key") {
          return (
            <div
              className={piece.key}
              // oxlint-disable-next-line react/no-array-index-key -- a row that never changes
              key={index}
              style={{
                fontSize: high * 0.15,
                gap: high * 0.06,
                height: high,
                width: high * 0.92,
              }}
            >
              <ShiftMark shift={one.shift} size={mark} />
              {presetPatterns[one.shift].name}
              <span
                className={piece.tap}
                style={{
                  bottom: -high * 0.08,
                  height: high * 0.36,
                  right: -high * 0.08,
                  width: high * 0.36,
                }}
              />
            </div>
          );
        }
        const width = high * 0.78;
        // The mark's top, and how far its corner is from the day's side.
        const top = high * 0.26 + (high * 0.74 - mark) / 2;
        const side = (width - mark) / 2;
        return (
          <div
            className={piece.day}
            // oxlint-disable-next-line react/no-array-index-key -- a row that never changes
            key={index}
            style={{
              fontSize: high * 0.15,
              height: high,
              marginLeft:
                one.says !== undefined && one.early === true ? high * 0.7 : 0,
              marginRight:
                one.says !== undefined && one.late === true ? high * 0.7 : 0,
              width,
            }}
          >
            {one.date}
            <ShiftMark
              early={one.early}
              late={one.late}
              shift={one.shift}
              size={mark}
            />
            {one.tag !== undefined && (
              <span
                className={piece.tag}
                style={{
                  fontSize: high * 0.13,
                  padding: `${high * 0.03}px ${high * 0.08}px`,
                  right: -high * 0.12,
                  top: -high * 0.07,
                }}
              >
                {one.tag}
              </span>
            )}
            {one.says !== undefined && (
              <>
                <span
                  className={piece.line}
                  style={{
                    height: 2,
                    [one.early === true ? "right" : "left"]: width - side,
                    top: top + mark * 0.12,
                    width: side + high * 0.14,
                  }}
                />
                <span
                  className={piece.says}
                  style={{
                    fontSize: high * 0.17,
                    [one.early === true ? "right" : "left"]: width + high * 0.2,
                    top: top + mark * 0.12 - high * 0.12,
                  }}
                >
                  {one.says}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// The widgets where wallOf puts them, each from the folder of its look.
// A cell is `row` times as tall as it is wide.
function Wall({
  alike,
  looks,
  pinned,
  row,
  widgets,
}: {
  alike: readonly string[];
  looks: readonly string[];
  pinned: readonly WallPin[];
  row: number;
  widgets: string[];
}) {
  return (
    <div className={styles.wall}>
      <div
        className={styles.wallGrid}
        style={{
          gridTemplateColumns: `repeat(${WALL.columns}, ${WIDGET_CELL})`,
          gridTemplateRows: `repeat(${WALL.rows}, calc(${WIDGET_CELL} * ${row}))`,
        }}
      >
        {wallOf(widgets, looks.length, pinned, alike).map((tile) => (
          <div
            className={styles.widget}
            key={`${tile.column} ${tile.row}`}
            style={{
              gridColumn: `${tile.column + 1} / span ${tile.columns}`,
              gridRow: `${tile.row + 1} / span ${tile.rows}`,
            }}
          >
            <img alt="" src={`${RAW}${looks[tile.look]}/${tile.file}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureGraphic() {
  return (
    <div
      className={cx(styles.root, styles.feature)}
      data-store-shot
      style={{ height: FEATURE_GRAPHIC.height, width: FEATURE_GRAPHIC.width }}
    >
      <PictureSky height="100%" />
      <div className={styles.featureTitle}>
        <PictureBrand size={88} />
      </div>
      <h1 className={cx(pictureTitle, styles.featureTitle)}>
        シフトを、ポチッと。
      </h1>
    </div>
  );
}
