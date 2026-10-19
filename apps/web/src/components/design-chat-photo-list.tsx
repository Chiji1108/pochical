import { chatRules } from "@pochical/design/chat";
import { Images } from "lucide-react";
import { useContext, useMemo, useState } from "react";
import { css, cx } from "styled-system/css";

import { sharePhoto, viewerPhotoOf } from "./design-chat-cards";
import type { ChatPhoto } from "./design-chat-cards";
import { blurOf } from "./design-chat-photos";
import { chatStyle } from "./design-chat-style";
import { PageHeader } from "./design-header";
import { PhotoViewer } from "./design-photo-viewer";
import { ToastContext } from "./design-toast";
import { Screen } from "./design-ui";

// A chat's photos alone (spec/chat.md, Photos), as LINE's 写真・動画,
// WhatsApp's メディア and Messages' 詳細 › 写真 list them: from the chat's
// ⋯, a grid of squares four across, the latest first, each opening large
// among the chat's photos. The apps page them from the group as they
// scroll; here the chat's sample photos are all there at once.

const list = {
  empty: css({
    alignItems: "center",
    color: "text.tertiary",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "12px",
    justifyContent: "center",
    textStyle: "body",
  }),
  // Edge to edge, a hairline apart, as the platforms' photo grids.
  grid: css({
    display: "grid",
    gap: "2px",
    gridTemplateColumns: "repeat(4, 1fr)",
    listStyle: "none",
    margin: "0 calc(-1 * var(--screen-right)) 0 calc(-1 * var(--screen-left))",
    padding: 0,
  }),
  header: css({ paddingBottom: "8px" }),
  scroll: css({
    flex: 1,
    marginBottom: "calc(-1 * var(--safe-bottom))",
    minHeight: 0,
    overflowY: "auto",
    paddingBottom: "var(--safe-bottom)",
  }),
  square: css({
    aspectRatio: "1",
    backgroundPosition: "center",
    backgroundSize: "cover",
    bg: "fill.tertiary",
    border: 0,
    cursor: "pointer",
    display: "block",
    overflow: "hidden",
    padding: 0,
    width: "100%",
  }),
};

// One square: the photo cut to it over its blur, fading in as it comes,
// or its grey breathing without one.
function Thumbnail({
  entry,
  onOpen,
}: {
  entry: ChatPhoto;
  onOpen: () => void;
}) {
  const { photo } = entry;
  const [drawn, setDrawn] = useState(false);
  const blur = useMemo(
    () => (photo.thumbHash === undefined ? undefined : blurOf(photo.thumbHash)),
    [photo.thumbHash]
  );
  return (
    <button
      aria-label={`${entry.label}、${entry.when}`}
      className={cx(
        list.square,
        !drawn && blur === undefined && chatStyle.photoLoading
      )}
      onClick={onOpen}
      style={{
        backgroundImage: blur === undefined ? undefined : `url(${blur})`,
      }}
      type="button"
    >
      <img
        alt=""
        className={chatStyle.photoImage}
        draggable={false}
        loading="lazy"
        onLoad={() => {
          setDrawn(true);
        }}
        src={photo.src}
        style={{
          animation:
            drawn && blur !== undefined
              ? `fadeIn ${chatRules.photoFadeMs}ms ease-out`
              : undefined,
          visibility: drawn ? "visible" : "hidden",
        }}
      />
    </button>
  );
}

export function ChatPhotoList({
  photos,
  backLabel,
  onBack,
}: {
  // The chat's photos in the order of its lines, as opened large.
  photos: ChatPhoto[];
  backLabel: string;
  onBack: () => void;
}) {
  const toast = useContext(ToastContext);
  const [viewing, setViewing] = useState<number>();
  // The latest at the top left, each knowing its place among them all.
  const latestFirst = photos
    .map((entry, index) => ({ entry, index }))
    .toReversed();
  return (
    <Screen>
      <div className={list.header}>
        <PageHeader back={backLabel} inlineTitle="写真" onBack={onBack} />
      </div>
      {photos.length === 0 ? (
        <div className={list.empty}>
          <Images aria-hidden="true" size={40} strokeWidth={1.5} />
          写真はまだありません
        </div>
      ) : (
        <div className={list.scroll}>
          <ul aria-label="写真" className={list.grid}>
            {latestFirst.map(({ entry, index }) => (
              <li key={entry.photo.src}>
                <Thumbnail
                  entry={entry}
                  onOpen={() => {
                    setViewing(index);
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      <PhotoViewer
        onOpenChange={(open) => {
          if (!open) {
            setViewing(undefined);
          }
        }}
        onSave={() => {
          toast("写真を保存しました");
        }}
        onShare={(shown) => {
          sharePhoto(shown).catch(() => undefined);
        }}
        open={viewing !== undefined}
        photos={photos.map(viewerPhotoOf)}
        start={viewing ?? 0}
        whole
      />
    </Screen>
  );
}
