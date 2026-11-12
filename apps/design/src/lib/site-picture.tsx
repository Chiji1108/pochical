import { themeSkyId } from "@pochical/design/skies";
import siteIcon from "@pochical/prototype/assets/icon.png?url";
import { paleSkyFromTop } from "@pochical/prototype/components/design-surprise";
import { TITLE } from "@pochical/prototype/lib/store-shots";
import { css } from "@pochical/styled-system/css";

// What the pictures photographed from /_render share: the site's sky
// behind them, the app's icon beside its name, and how a title is set.
// The share image (share-image.tsx) and the stores' pictures
// (store-shot.tsx) each give them their own sizes.

const styles = {
  brand: css({
    alignItems: "center",
    display: "flex",
    fontWeight: 700,
    letterSpacing: "0.04em",
  }),
  // The top page's sky as it falls from the top, giving way to the paper
  // below it.
  sky: css({
    inset: "0 0 auto",
    maskImage: "linear-gradient(to bottom, black 40%, transparent)",
    pointerEvents: "none",
    position: "absolute",
  }),
};

const skyBackground = paleSkyFromTop(themeSkyId("pochical"));

// A title's weight, at the font size its picture gives it, and its line
// and spacing (TITLE, which the stores' pictures measure a line's room
// by), given beside the class as a style.
export const pictureTitle = css({ fontWeight: 700, margin: 0 });
export const pictureTitleStyle = {
  letterSpacing: `${TITLE.spacing}em`,
  lineHeight: TITLE.line,
};

// The sky over the top of a picture, `height` down it.
export function PictureSky({ height }: { height: string }) {
  return (
    <div
      aria-hidden="true"
      className={styles.sky}
      style={{ background: skyBackground, height }}
    />
  );
}

// The app's icon, `size` pixels across, and ポチカル beside it.
export function PictureBrand({ size }: { size: number }) {
  return (
    <p
      className={styles.brand}
      style={{ fontSize: size / 2, gap: (size * 14) / 52 }}
    >
      <img
        alt=""
        height={size}
        src={siteIcon}
        style={{ borderRadius: (size * 12) / 52 }}
        width={size}
      />
      ポチカル
    </p>
  );
}
