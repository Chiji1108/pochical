import { chatRules } from "@pochical/design/chat";
import { X } from "lucide-react";
import { useContext, useRef, useState } from "react";
import type { Ref } from "react";
import { rgbaToThumbHash, thumbHashToDataURL } from "thumbhash";

import type { Photo } from "../lib/design-sample-photos";
import { chatStyle } from "./design-chat-style";
import { ToastContext } from "./design-toast";
import { srOnly } from "./design-ui";

// Photos in a chat, as the group chats and the support chat both send
// them: choosing them for the next send, holding them above the composer,
// and the size a photo's line takes.

// How many photos go in one send: a roster is a page or two, and more
// would flood a small group's chat.
export const maxPhotos = chatRules.photosPerSend;

// The longest side a photo is drawn at to make its ThumbHash, the most
// the format reads.
const thumbHashEdge = 100;

const base64Of = (bytes: Uint8Array) => btoa(String.fromCodePoint(...bytes));

export const bytesOf = (base64: string) =>
  Uint8Array.from(atob(base64), (char) => char.codePointAt(0) ?? 0);

// A photo's ThumbHash, as base64: the photo drawn small, at most
// thumbHashEdge on its longer side; none when it cannot be drawn.
function thumbHashOf(image: HTMLImageElement): string | undefined {
  const scale = Math.min(
    thumbHashEdge / Math.max(image.naturalWidth, image.naturalHeight),
    1
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) {
    return undefined;
  }
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  return base64Of(rgbaToThumbHash(width, height, data));
}

// The blur a ThumbHash draws, as an image to show where its photo will
// be while the photo comes.
export const blurOf = (thumbHash: string) =>
  thumbHashToDataURL(bytesOf(thumbHash));

// A chosen photo with its size and ThumbHash, read before it is shown so
// its line keeps its place; the apps make them while shrinking the photo
// to send.
export async function photoOf(file: File): Promise<Photo> {
  const src = URL.createObjectURL(file);
  const image = new Image();
  image.src = src;
  await image.decode();
  return {
    height: image.naturalHeight,
    src,
    thumbHash: thumbHashOf(image),
    width: image.naturalWidth,
  };
}

// The box a photo fits in, and how far from square it may be before its
// ends are cut, as LINE crops a panorama in the chat.
const photoBox = { height: 260, width: 220 };
const photoAspect = { max: 2, min: 1 / 2 };

export function photoSize(photo: Photo) {
  const aspect = Math.min(
    Math.max(photo.width / photo.height, photoAspect.min),
    photoAspect.max
  );
  const width = Math.min(photoBox.width, photoBox.height * aspect);
  return { height: Math.round(width / aspect), width: Math.round(width) };
}

// Photos chosen to go with the next send, as the chat apps hold them
// above the composer: nothing is sent on choosing. While some are still
// being read, `reading` holds sending back, so none lands in the composer
// after the message has gone.
export function useChosenPhotos() {
  const toast = useContext(ToastContext);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [readingCount, setReadingCount] = useState(0);
  // Photos still being read, known at once to a choice right after (two
  // pastes in a row), which the state would tell only once drawn again.
  const coming = useRef(0);
  const handleChoose = async (files: File[]) => {
    const room = Math.max(0, maxPhotos - photos.length - coming.current);
    if (files.length > room) {
      toast(`写真は一度に${maxPhotos}枚まで送れます`, "problem");
    }
    const taken = files.slice(0, room);
    coming.current += taken.length;
    setReadingCount((count) => count + taken.length);
    // One photo that cannot be opened leaves the others chosen.
    const results = await Promise.allSettled(taken.map(photoOf));
    coming.current -= taken.length;
    setReadingCount((count) => count - taken.length);
    const chosen = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    setPhotos((before) => [...before, ...chosen].slice(0, maxPhotos));
    if (chosen.length < taken.length) {
      toast("開けない写真がありました", "problem");
    }
  };
  const handleRemove = (photo: Photo) => {
    setPhotos((before) => before.filter((other) => other !== photo));
  };
  const clear = () => {
    setPhotos([]);
  };
  return {
    clear,
    handleChoose,
    handleRemove,
    photos,
    reading: readingCount > 0,
  };
}

// The system's photo picker, as the apps open PHPicker and Android's
// photo picker; the camera is left to the camera. Out of sight: a tool
// button opens it.
export function PhotoInput({
  ref,
  onChoose,
}: {
  ref: Ref<HTMLInputElement>;
  onChoose: (files: File[]) => Promise<void>;
}) {
  return (
    <input
      accept="image/*"
      className={srOnly}
      multiple
      onChange={(event) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = "";
        onChoose(files).catch(() => undefined);
      }}
      ref={ref}
      tabIndex={-1}
      type="file"
    />
  );
}

// The photos chosen, small over the composer, each with an × to take it
// back out. `below` when something else already sits over the composer.
export function PhotoTray({
  photos,
  below,
  onRemove,
}: {
  photos: Photo[];
  below: boolean;
  onRemove: (photo: Photo) => void;
}) {
  if (photos.length === 0) {
    return null;
  }
  return (
    <ul aria-label="送る写真" className={chatStyle.tray({ below })}>
      {photos.map((photo, index) => (
        <li className={chatStyle.trayItem} key={photo.src}>
          <img alt="" className={chatStyle.trayImage} src={photo.src} />
          <button
            aria-label={`${index + 1}枚目の写真を外す`}
            className={chatStyle.trayRemove}
            onClick={() => {
              onRemove(photo);
            }}
            type="button"
          >
            <X aria-hidden="true" size={12} strokeWidth={3} />
          </button>
        </li>
      ))}
    </ul>
  );
}
