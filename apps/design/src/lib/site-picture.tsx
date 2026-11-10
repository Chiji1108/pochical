import { themeSkyId } from "@pochical/design/skies";
import siteIcon from "@pochical/prototype/assets/icon.png?url";
import { paleSkyFromTop } from "@pochical/prototype/components/design-surprise";
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

// A title's weight and spacing, at the font size its picture gives it.
export const pictureTitle = css({
  fontWeight: 700,
  letterSpacing: "0.01em",
  lineHeight: 1.35,
  margin: 0,
});

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
