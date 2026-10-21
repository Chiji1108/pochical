import { Dialog, Portal } from "@ark-ui/react";
import { chatRules } from "@pochical/design/chat";
import { css, cva } from "@pochical/styled-system/css";
import { Download, Share, X } from "lucide-react";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, MouseEvent, PointerEvent } from "react";

import { useReducedMotion } from "../lib/device-media";
import { PhoneContext } from "./design-sheet";

// A photo opened large, as Photos, Signal and Telegram open one
// (spec/chat.md, Photos): whole on black, tapped twice or pinched to zoom
// and dragged about while zoomed, swiped to the chat's photos before and
// after it, a tap showing or hiding its buttons, and × or a pull downward
// closing it, the ground fading as it is pulled. Opening from the photo's
// place and closing back to it is the apps' own system transition, left
// to them here (leave OS motion to the OS).

// One photo to look at.
export type ViewerPhoto = {
  src: string;
  // Its blur and shape, shown until it comes, as a chat's photo has one.
  blur?: { src: string; aspect: number };
  // Its name for a screen reader, like whose picture it is.
  label: string;
  // Still on its way: it comes after this long, and says so.
  coming?: { after: number; onCome: () => void };
};

// How far a photo is pulled down before letting go closes it.
const dismissDistance = 120;
// How far it zooms in: as far as Signal's, and a double tap half way.
const deepest = 4;
const tapped = 2;
// How long a tap waits for a second one before it shows or hides the
// buttons, as Photos waits.
const doubleTapMs = 250;
// The room between photos as they are swiped.
const pageGap = 16;

type Zoom = { scale: number; x: number; y: number };
const unzoomed: Zoom = { scale: 1, x: 0, y: 0 };

type Point = { x: number; y: number };

// What the fingers on the photo are doing, from where they began.
type Hold =
  | { kind: "pull"; from: number; by: number }
  | { kind: "pan"; from: Point; start: Zoom }
  | { kind: "pinch"; distance: number; middle: Point; start: Zoom };

const onButton = (target: EventTarget) =>
  target instanceof Element && target.closest("button") !== null;

const distanceOf = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const middleOf = (a: Point, b: Point) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const viewer = {
  backdrop: css({
    _closed: { animation: "fadeOut 0.2s ease-in" },
    _open: { animation: "fadeIn 0.2s ease-out" },
    bg: "media.background",
    inset: 0,
    position: "absolute",
    zIndex: 30,
  }),
  // × at the top right, the count in the middle, 共有 at the bottom left
  // and 保存 at the bottom right, as Photos and LINE place them, all round
  // on the black; hidden together at a tap.
  button: cva({
    base: {
      bg: "media.fill",
      border: 0,
      borderRadius: "circle",
      color: "media.text",
      display: "grid",
      height: "action",
      placeItems: "center",
      pointerEvents: "auto",
      position: "absolute",
      width: "action",
    },
    variants: {
      at: {
        bottom: { bottom: "calc(var(--safe-bottom) + 12px)", right: "16px" },
        bottomLeft: { bottom: "calc(var(--safe-bottom) + 12px)", left: "16px" },
        top: { right: "16px", top: "56px" },
      },
    },
  }),
  chrome: cva({
    base: {
      inset: 0,
      pointerEvents: "none",
      position: "absolute",
      transition: "opacity 0.2s",
      zIndex: 1,
    },
    variants: {
      bare: {
        false: {},
        true: { "& > *": { pointerEvents: "none" }, opacity: 0 },
      },
    },
  }),
  content: css({
    _closed: { animation: "fadeOut 0.2s ease-in" },
    _open: { animation: "popIn 0.2s ease-out" },
    height: "100%",
    outline: "none",
    position: "relative",
    width: "100%",
  }),
  count: css({
    bg: "media.fill",
    borderRadius: "full",
    color: "media.text",
    left: "50%",
    lineHeight: "action",
    paddingInline: "12px",
    position: "absolute",
    textStyle: "headline",
    top: "56px",
    transform: "translateX(-50%)",
  }),
  hidden: css({ srOnly: true }),
  page: css({
    alignItems: "center",
    display: "flex",
    flex: "0 0 100%",
    height: "100%",
    justifyContent: "center",
    overflow: "hidden",
    scrollSnapAlign: "center",
    scrollSnapStop: "always",
  }),
  pages: css({
    display: "flex",
    gap: `${pageGap}px`,
    height: "100%",
    overflowY: "hidden",
    scrollSnapType: "x mandatory",
    scrollbarWidth: "none",
    width: "100%",
  }),
  // A profile picture fills a square; a photo sent in a chat shows whole,
  // in its own shape.
  photo: cva({
    base: { userSelect: "none", width: "100%" },
    variants: {
      whole: {
        false: { aspectRatio: "1", objectFit: "cover" },
        true: { maxHeight: "100%", objectFit: "contain" },
      },
    },
  }),
  positioner: css({ inset: 0, position: "absolute", zIndex: 31 }),
  // The photo over its blur, one on the other.
  stack: css({
    "& > *": { gridArea: "1 / 1" },
    display: "grid",
    height: "100%",
    placeItems: "center",
    width: "100%",
  }),
};

// One photo, over its blur until it comes, fading in over it.
function ViewerPage({
  photo,
  whole,
  pictureRef,
  style,
}: {
  photo: ViewerPhoto;
  whole: boolean;
  pictureRef: (element: HTMLElement | null) => void;
  style: CSSProperties;
}) {
  const [here, setHere] = useState(photo.coming === undefined);
  // The photo has come and is fading in over its blur, or is shown,
  // with its blur gone: at once for one already read.
  const [drawn, setDrawn] = useState<"came" | "shown">();
  useEffect(() => {
    const { coming } = photo;
    if (here || !coming) {
      return;
    }
    const timer = setTimeout(() => {
      coming.onCome();
      setHere(true);
    }, coming.after);
    return () => {
      clearTimeout(timer);
    };
  }, [here, photo]);
  const { blur } = photo;
  return (
    <div className={viewer.stack} ref={pictureRef} style={style}>
      {blur && drawn !== "shown" && (
        <img
          alt=""
          className={viewer.photo({ whole })}
          draggable={false}
          src={blur.src}
          style={{ aspectRatio: blur.aspect, objectFit: "fill" }}
        />
      )}
      {here && (
        <img
          alt={photo.label}
          className={viewer.photo({ whole })}
          draggable={false}
          onAnimationEnd={() => {
            setDrawn("shown");
          }}
          onLoad={() => {
            setDrawn((before) => before ?? "came");
          }}
          ref={(image) => {
            if (image?.complete === true) {
              setDrawn((before) => before ?? "shown");
            }
          }}
          src={photo.src}
          style={
            blur && {
              animation:
                drawn === "came"
                  ? `fadeIn ${chatRules.photoFadeMs}ms ease-out`
                  : undefined,
              visibility: drawn === undefined ? "hidden" : "visible",
            }
          }
        />
      )}
    </div>
  );
}

// The photos and their buttons, drawn anew each time it opens, on the
// photo tapped and zoomed out.
function ViewerBody({
  photos,
  start,
  whole,
  onSave,
  onShare,
  onClose,
  onPull,
  onShow,
}: {
  photos: ViewerPhoto[];
  start: number;
  whole: boolean;
  onSave?: (photo: ViewerPhoto) => void;
  onShare?: (photo: ViewerPhoto) => void;
  onClose: () => void;
  onPull: (by: number) => void;
  onShow?: (index: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(start);
  const [zoom, setZoom] = useState(unzoomed);
  const [hold, setHold] = useState<Hold>();
  const [bare, setBare] = useState(false);
  const pages = useRef<HTMLDivElement>(null);
  const pictures = useRef<(HTMLElement | null)[]>([]);
  const fingers = useRef(new Map<number, Point>());
  const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The fingers moved since they went down: not a tap. Nor is the end of
  // the tap that opened it, which went down on the chat.
  const moved = useRef(false);
  const pressed = useRef(false);
  const zoomed = zoom.scale > 1;
  const pull = hold?.kind === "pull" ? Math.max(hold.by, 0) : 0;
  const shown = photos[index] ?? photos[0];

  // Opened on the photo tapped.
  useLayoutEffect(() => {
    const scroller = pages.current;
    if (scroller) {
      scroller.scrollLeft = start * (scroller.clientWidth + pageGap);
    }
  }, [start]);

  useEffect(
    () => () => {
      clearTimeout(tapTimer.current);
    },
    []
  );

  const pageWidth = () => (pages.current?.clientWidth ?? 0) + pageGap;

  const goTo = (next: number) => {
    const to = Math.min(Math.max(next, 0), photos.length - 1);
    pages.current?.scrollTo({
      behavior: reduceMotion ? "instant" : "smooth",
      left: to * pageWidth(),
    });
  };

  // Keeps a zoomed photo over the screen, never pulled off it.
  const bounded = (next: Zoom): Zoom => {
    // The photo drawn, not the page it is in the middle of.
    const picture = pictures.current[index]?.lastElementChild;
    const room = pages.current;
    if (!(picture instanceof HTMLElement && room)) {
      return next;
    }
    const roomX = Math.max(
      (picture.offsetWidth * next.scale - room.clientWidth) / 2,
      0
    );
    const roomY = Math.max(
      (picture.offsetHeight * next.scale - room.clientHeight) / 2,
      0
    );
    return {
      scale: next.scale,
      x: Math.min(Math.max(next.x, -roomX), roomX),
      y: Math.min(Math.max(next.y, -roomY), roomY),
    };
  };

  // A point on the screen, from the middle of the page.
  const fromMiddle = (point: Point): Point => {
    const rect = pages.current?.getBoundingClientRect();
    if (!rect) {
      return point;
    }
    return {
      x: point.x - rect.left - rect.width / 2,
      y: point.y - rect.top - rect.height / 2,
    };
  };

  // In on the point tapped twice, or back out.
  const zoomAt = (point: Point) => {
    if (zoomed) {
      setZoom(unzoomed);
      return;
    }
    const at = fromMiddle(point);
    setZoom(
      bounded({
        scale: tapped,
        x: -at.x * (tapped - 1),
        y: -at.y * (tapped - 1),
      })
    );
  };

  const down = (event: PointerEvent<HTMLDivElement>) => {
    // A button's press is its own, not the start of a pull.
    if (onButton(event.target)) {
      return;
    }
    fingers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    moved.current = false;
    pressed.current = true;
    const held = [...fingers.current.values()];
    const [first, second] = held;
    if (first && second) {
      setHold({
        distance: distanceOf(first, second),
        kind: "pinch",
        middle: fromMiddle(middleOf(first, second)),
        start: zoom,
      });
    } else if (first && zoomed) {
      setHold({ from: first, kind: "pan", start: zoom });
    } else if (first) {
      setHold({ by: 0, from: first.y, kind: "pull" });
    }
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!fingers.current.has(event.pointerId)) {
      return;
    }
    fingers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const [first, second] = [...fingers.current.values()];
    if (!(hold && first)) {
      return;
    }
    moved.current = true;
    if (hold.kind === "pinch" && second) {
      const scale = Math.min(
        Math.max(
          (hold.start.scale * distanceOf(first, second)) / hold.distance,
          1
        ),
        deepest
      );
      const middle = fromMiddle(middleOf(first, second));
      const grown = scale / hold.start.scale;
      setZoom(
        bounded({
          scale,
          x: middle.x - (hold.middle.x - hold.start.x) * grown,
          y: middle.y - (hold.middle.y - hold.start.y) * grown,
        })
      );
    } else if (hold.kind === "pan") {
      setZoom(
        bounded({
          scale: hold.start.scale,
          x: hold.start.x + first.x - hold.from.x,
          y: hold.start.y + first.y - hold.from.y,
        })
      );
    } else if (hold.kind === "pull") {
      setHold({ ...hold, by: first.y - hold.from });
      onPull(Math.max(first.y - hold.from, 0));
    }
  };

  const up = (event: PointerEvent<HTMLDivElement>) => {
    fingers.current.delete(event.pointerId);
    onPull(0);
    if (hold?.kind === "pull" && pull > dismissDistance) {
      onClose();
    }
    if (zoom.scale <= 1.01) {
      setZoom(unzoomed);
    }
    const [left] = fingers.current.values();
    // One finger left of a pinch pans on from where it is.
    setHold(
      left && zoom.scale > 1
        ? { from: left, kind: "pan", start: zoom }
        : undefined
    );
  };

  // A tap shows or hides the buttons, once it is clear it is not the
  // first of two.
  const tap = (event: MouseEvent<HTMLDivElement>) => {
    const own = pressed.current;
    pressed.current = false;
    if (!own || moved.current || onButton(event.target)) {
      return;
    }
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      setBare((was) => !was);
    }, doubleTapMs);
  };

  const settle = () => {
    const width = pageWidth();
    if (width <= 0 || !pages.current) {
      return;
    }
    const at = Math.round(pages.current.scrollLeft / width);
    if (at !== index) {
      setIndex(at);
      setZoom(unzoomed);
      onShow?.(at);
    }
  };

  const gliding = hold === undefined && !reduceMotion;
  return (
    <Dialog.Content
      aria-label={shown?.label}
      className={viewer.content}
      onClick={tap}
      onDoubleClick={(event) => {
        if (onButton(event.target)) {
          return;
        }
        clearTimeout(tapTimer.current);
        zoomAt({ x: event.clientX, y: event.clientY });
      }}
      onPointerCancel={(event) => {
        fingers.current.delete(event.pointerId);
        setHold(undefined);
        onPull(0);
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          goTo(index + 1);
        } else if (event.key === "ArrowLeft") {
          goTo(index - 1);
        }
      }}
    >
      <div className={viewer.chrome({ bare })}>
        <Dialog.CloseTrigger
          aria-label="閉じる"
          className={viewer.button({ at: "top" })}
        >
          <X aria-hidden="true" size={20} />
        </Dialog.CloseTrigger>
        {photos.length > 1 && (
          <span aria-live="polite" className={viewer.count}>
            <span aria-hidden="true">
              {index + 1} / {photos.length}
            </span>
            <span className={viewer.hidden}>
              {photos.length}枚中{index + 1}枚目
            </span>
          </span>
        )}
        {onShare && shown && (
          <button
            aria-label="共有"
            className={viewer.button({ at: "bottomLeft" })}
            onClick={() => {
              onShare(shown);
            }}
            type="button"
          >
            <Share aria-hidden="true" size={20} />
          </button>
        )}
        {onSave && shown && (
          <button
            aria-label="保存"
            className={viewer.button({ at: "bottom" })}
            onClick={() => {
              onSave(shown);
            }}
            type="button"
          >
            <Download aria-hidden="true" size={20} />
          </button>
        )}
      </div>
      <div
        className={viewer.pages}
        onScroll={settle}
        ref={pages}
        style={{
          // Swiped to the next while whole; dragged about, zoomed.
          overflowX: zoomed ? "hidden" : "auto",
          touchAction: zoomed ? "none" : "pan-x",
        }}
      >
        {photos.map((photo, at) => (
          <div className={viewer.page} key={photo.src}>
            <ViewerPage
              photo={photo}
              pictureRef={(element) => {
                pictures.current[at] = element;
              }}
              style={{
                transform:
                  at === index
                    ? `translate(${zoom.x}px, ${zoom.y + pull}px) scale(${zoom.scale})`
                    : undefined,
                transition: gliding ? "transform 0.2s ease-out" : "none",
              }}
              whole={whole}
            />
          </div>
        ))}
      </div>
    </Dialog.Content>
  );
}

export function PhotoViewer({
  photos,
  start = 0,
  whole = false,
  open,
  onOpenChange,
  onSave,
  onShare,
  onShow,
  finalFocusEl,
}: {
  // The chat's photos in the order of its lines, or one alone.
  photos: ViewerPhoto[];
  // The one opened among them.
  start?: number;
  // Shows the whole photo in its own shape, not cut to a square.
  whole?: boolean;
  // Offers 保存 and 共有, for a photo sent in a chat; not for someone's
  // face, which is theirs to keep.
  onSave?: (photo: ViewerPhoto) => void;
  onShare?: (photo: ViewerPhoto) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Swiped to another of the photos, by its place among them.
  onShow?: (index: number) => void;
  // Where it closes back to, when not the place it was opened from.
  finalFocusEl?: () => HTMLElement | null;
}) {
  const phone = useContext(PhoneContext);
  // How far the photo is pulled down, the ground fading as it goes.
  const [pull, setPull] = useState(0);
  return (
    <Dialog.Root
      finalFocusEl={finalFocusEl}
      lazyMount
      onExitComplete={() => {
        setPull(0);
      }}
      onOpenChange={(details) => {
        onOpenChange(details.open);
      }}
      open={open}
      preventScroll={false}
      unmountOnExit
    >
      <Portal container={phone ?? undefined}>
        <Dialog.Backdrop
          className={viewer.backdrop}
          style={{ opacity: 1 - (pull / dismissDistance) * 0.5 }}
        />
        <Dialog.Positioner className={viewer.positioner}>
          <ViewerBody
            onClose={() => {
              onOpenChange(false);
            }}
            onPull={setPull}
            onSave={onSave}
            onShare={onShare}
            onShow={onShow}
            photos={photos}
            start={start}
            whole={whole}
          />
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
