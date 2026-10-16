import { Dialog, Portal } from "@ark-ui/react";
import { chatRules } from "@pochical/design/chat";
import { useContext, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import { css, cva, cx } from "styled-system/css";

import { PhoneContext } from "./design-sheet";

// How far in a photo can be brought, past filling the circle.
const maxZoom = 4;
// How far an arrow key moves the photo, and how much + or − zooms it.
const keyStep = 16;
const keyZoom = 1.1;
// What each key does: across, down and how much to zoom.
const keySteps = new Map<string, [number, number, number]>([
  ["+", [0, 0, keyZoom]],
  ["=", [0, 0, keyZoom]],
  ["-", [0, 0, 1 / keyZoom]],
  ["ArrowDown", [0, keyStep, 1]],
  ["ArrowLeft", [-keyStep, 0, 1]],
  ["ArrowRight", [keyStep, 0, 1]],
  ["ArrowUp", [0, -keyStep, 1]],
]);
// How much one notch of a mouse wheel zooms.
const wheelZoom = 0.0015;
// The circle's room on either side.
const circleInset = 16;

const crop = {
  backdrop: css({
    _closed: { animation: "fadeOut 0.2s ease-in" },
    _open: { animation: "fadeIn 0.2s ease-out" },
    bg: "media.background",
    inset: 0,
    position: "absolute",
    zIndex: 30,
  }),
  bar: css({
    bottom: "calc(var(--safe-bottom) + 8px)",
    display: "flex",
    justifyContent: "space-between",
    left: 0,
    paddingInline: "8px",
    position: "absolute",
    right: 0,
    zIndex: 1,
  }),
  choose: css({ fontWeight: 600 }),
  content: css({
    _closed: { animation: "fadeOut 0.2s ease-in" },
    _open: { animation: "fadeIn 0.2s ease-out" },
    height: "100%",
    outline: "none",
    overflow: "hidden",
    position: "relative",
    touchAction: "none",
    width: "100%",
  }),
  // The frame the photo is cut to, with the rest dimmed around it: round
  // for a face, a group's rounded square for its mark.
  frame: cva({
    base: {
      aspectRatio: "1",
      boxShadow: "0 0 0 100vmax token(colors.media.shade)",
      left: `${circleInset}px`,
      outline: "1px solid token(colors.media.textSecondary)",
      pointerEvents: "none",
      position: "absolute",
      right: `${circleInset}px`,
      top: "50%",
      transform: "translateY(-50%)",
    },
    variants: {
      shape: {
        round: { borderRadius: "circle" },
        // As GroupIcon rounds its corners.
        square: { borderRadius: "28%" },
      },
    },
  }),
  photo: css({
    left: "50%",
    maxWidth: "none",
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    userSelect: "none",
  }),
  positioner: css({ inset: 0, position: "absolute", zIndex: 31 }),
  text: css({
    bg: "transparent",
    border: 0,
    color: "media.text",
    cursor: "pointer",
    minHeight: "touch",
    paddingInline: "12px",
    textStyle: "body",
  }),
  title: css({
    color: "media.text",
    fontWeight: 600,
    left: 0,
    position: "absolute",
    right: 0,
    textAlign: "center",
    textStyle: "headline",
    top: "calc(var(--safe-top) + 12px)",
    zIndex: 1,
  }),
};

type Size = { width: number; height: number };
type Place = { x: number; y: number; zoom: number };

// Keeps the photo over the whole circle: no closer than filling it, no
// farther in than maxZoom, and never moved so far an edge shows inside.
function clampPlace(place: Place, photo: Size, circle: number): Place {
  const zoom = Math.min(Math.max(place.zoom, 1), maxZoom);
  const scale = (circle / Math.min(photo.width, photo.height)) * zoom;
  const spareX = (photo.width * scale - circle) / 2;
  const spareY = (photo.height * scale - circle) / 2;
  return {
    x: Math.min(Math.max(place.x, -spareX), spareX),
    y: Math.min(Math.max(place.y, -spareY), spareY),
    zoom,
  };
}

// The square of the photo inside the circle, drawn at no more than a
// face's size.
async function cutPhoto(
  image: HTMLImageElement,
  place: Place,
  circle: number
): Promise<string> {
  const photo = { height: image.naturalHeight, width: image.naturalWidth };
  const scale = (circle / Math.min(photo.width, photo.height)) * place.zoom;
  const side = circle / scale;
  const left = photo.width / 2 - place.x / scale - side / 2;
  const top = photo.height / 2 - place.y / scale - side / 2;
  const edge = Math.min(Math.round(side), chatRules.pictureMaxEdge);
  const canvas = new OffscreenCanvas(edge, edge);
  canvas
    .getContext("2d")
    ?.drawImage(image, left, top, side, side, 0, 0, edge, edge);
  const blob = await canvas.convertToBlob({ quality: 0.9, type: "image/jpeg" });
  return URL.createObjectURL(blob);
}

// A picked photo to move and zoom inside its frame before it becomes a
// face or a group's mark, as the platforms' contacts and LINE ask: drag
// to move, pinch or the wheel to zoom, キャンセル or 選択 at the foot.
export function PhotoCrop({
  photo,
  shape = "round",
  onDone,
}: {
  // What the photo shows in: a face's circle or a group's square.
  shape?: "round" | "square";
  // The picked photo; none while closed.
  photo?: string;
  // The square cut from it, or none when cancelled.
  onDone: (cut?: string) => void;
}) {
  const phone = useContext(PhoneContext);
  const image = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  // The photo's own size and the circle's width, once it has come.
  const [size, setSize] = useState<Size & { circle: number }>();
  const [place, setPlace] = useState<Place>({ x: 0, y: 0, zoom: 1 });
  const circle = size?.circle ?? 0;
  const scale = size
    ? (circle / Math.min(size.width, size.height)) * place.zoom
    : 0;
  // Moves the photo by a drag and zooms it about the circle's middle, so
  // what is there stays there.
  const move = (dx: number, dy: number, by: number) => {
    if (!size) {
      return;
    }
    setPlace((before) => {
      const zoom = Math.min(Math.max(before.zoom * by, 1), maxZoom);
      const grown = zoom / before.zoom;
      return clampPlace(
        { x: before.x * grown + dx, y: before.y * grown + dy, zoom },
        size,
        circle
      );
    });
  };
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return a === undefined || b === undefined
      ? 0
      : Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerMove = (event: PointerEvent) => {
    const before = pointers.current.get(event.pointerId);
    if (!before) {
      return;
    }
    const pinchBefore = spread();
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const count = pointers.current.size;
    const pinchAfter = spread();
    move(
      (event.clientX - before.x) / count,
      (event.clientY - before.y) / count,
      pinchBefore > 0 ? pinchAfter / pinchBefore : 1
    );
  };
  const onPointerEnd = (event: PointerEvent) => {
    pointers.current.delete(event.pointerId);
  };
  const close = () => {
    setSize(undefined);
    setPlace({ x: 0, y: 0, zoom: 1 });
    pointers.current.clear();
  };
  const choose = async () => {
    const cut =
      image.current === null
        ? undefined
        : await cutPhoto(image.current, place, circle);
    close();
    onDone(cut);
  };
  return (
    <Dialog.Root
      lazyMount
      onOpenChange={(details) => {
        if (!details.open) {
          close();
          onDone();
        }
      }}
      open={photo !== undefined}
      preventScroll={false}
      unmountOnExit
    >
      <Portal container={phone ?? undefined}>
        <Dialog.Backdrop className={crop.backdrop} />
        <Dialog.Positioner className={crop.positioner}>
          <Dialog.Content
            aria-label="移動と拡大縮小"
            className={crop.content}
            onPointerCancel={onPointerEnd}
            onPointerDown={(event) => {
              pointers.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
              });
            }}
            onPointerMove={onPointerMove}
            // Arrows move the photo and + or − zoom it, for whoever has
            // no pointer.
            onKeyDown={(event) => {
              const step = keySteps.get(event.key);
              if (step !== undefined) {
                event.preventDefault();
                move(...step);
              }
            }}
            onPointerUp={onPointerEnd}
            onWheel={(event: WheelEvent) => {
              move(0, 0, 1 - event.deltaY * wheelZoom);
            }}
          >
            {photo !== undefined && (
              <img
                alt=""
                className={crop.photo}
                draggable={false}
                onLoad={(event) => {
                  const { naturalHeight, naturalWidth, parentElement } =
                    event.currentTarget;
                  setSize({
                    circle: (parentElement?.clientWidth ?? 0) - circleInset * 2,
                    height: naturalHeight,
                    width: naturalWidth,
                  });
                }}
                ref={image}
                src={photo}
                style={
                  size
                    ? {
                        height: size.height * scale,
                        transform: `translate(calc(-50% + ${place.x}px), calc(-50% + ${place.y}px))`,
                        width: size.width * scale,
                      }
                    : { visibility: "hidden" }
                }
              />
            )}
            <span aria-hidden="true" className={crop.frame({ shape })} />
            <Dialog.Title className={crop.title}>移動と拡大縮小</Dialog.Title>
            <div className={crop.bar}>
              <Dialog.CloseTrigger
                className={crop.text}
                // Not the start of a drag.
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
              >
                キャンセル
              </Dialog.CloseTrigger>
              <button
                className={cx(crop.text, crop.choose)}
                disabled={!size}
                onClick={() => {
                  void choose();
                }}
                // Not the start of a drag.
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                type="button"
              >
                選択
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
