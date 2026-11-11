import {
  FEATURE_GRAPHIC,
  HEADLINE_SHARE,
  SITE_WALL,
  STORE_SHOTS,
  STORES,
  WALL,
  wallOf,
} from "@pochical/prototype/lib/store-shots";
import type { StoreId, WallPin } from "@pochical/prototype/lib/store-shots";
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
  // A tile's part of its screen, the screen as wide as the tile and cut
  // off at its foot: a card as a widget on the wall is.
  tilePart: css({
    "& img": { display: "block", width: "100%" },
    bg: "white",
    borderRadius: "calc(var(--u) * 4.25)",
    boxShadow:
      "0 calc(var(--u) * 1) calc(var(--u) * 3.5) rgba(60, 70, 60, 0.2)",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  }),
  tileWords: css({
    fontSize: "calc(var(--u) * 4.8)",
    fontWeight: 700,
    lineHeight: 1.3,
    paddingBottom: "calc(var(--u) * 1.6)",
    paddingLeft: "calc(var(--u) * 1.5)",
  }),
  // The tiles one over the other, sharing the room under the headline.
  tiles: css({
    "& figure": {
      display: "flex",
      flex: 1,
      flexDirection: "column",
      margin: 0,
      minHeight: 0,
    },
    display: "flex",
    flexDirection: "column",
    gap: "calc(var(--u) * 3.5)",
    inset: "var(--headline) calc(var(--u) * 5) calc(var(--u) * 5)",
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
  const { shot: name, store, widgets } = Route.useSearch();
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
        <div className={styles.tiles}>
          {shot.tiles.map((tile) => (
            <figure key={tile.raw}>
              <figcaption className={styles.tileWords}>{tile.words}</figcaption>
              <div className={styles.tilePart}>
                <img
                  alt=""
                  src={RAW + tile.raw}
                  style={{ marginTop: `${-100 * tile.top[store]}%` }}
                />
              </div>
            </figure>
          ))}
        </div>
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

// The widgets where wallOf puts them, each from the folder of its look.
// A cell is `row` times as tall as it is wide.
function Wall({
  looks,
  pinned,
  row,
  widgets,
}: {
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
        {wallOf(widgets, looks.length, pinned).map((tile) => (
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
