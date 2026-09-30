import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";

// How far ahead of the screen its contents start: about a screen's height,
// so they are ready by the time a scroll brings them in.
const AHEAD = "100% 0px";

function Passthrough({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// A promise and what settles it. Promise.withResolvers would do, but it
// needs iOS 17.4, and the landing page is for older iPhones too.
function gate() {
  let open: (() => void) | undefined;
  // oxlint-disable-next-line promise/avoid-new
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    open: () => {
      open?.();
    },
    opened,
  };
}

// A box whose contents React takes over only once it comes near the
// screen. The server draws them as usual, and until then that drawing
// stands, still, while the rest of the page comes alive first (React's
// selective hydration: a Suspense boundary waits for its code). For
// screens that are only looked at, like the landing page's lower phones.
// Reached by moving within the site instead, the box stays empty until
// it is near.
export function WhenNear({ children, ...props }: ComponentProps<"div">) {
  const box = useRef<HTMLDivElement>(null);
  const [near] = useState(gate);
  const [Content] = useState(() =>
    lazy(async () => {
      await near.opened;
      return { default: Passthrough };
    })
  );
  useEffect(() => {
    const element = box.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      near.open();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          near.open();
          observer.disconnect();
        }
      },
      { rootMargin: AHEAD }
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [near]);
  // The server has nothing to wait for.
  const onServer = typeof window === "undefined";
  return (
    <div ref={box} {...props}>
      <Suspense>{onServer ? children : <Content>{children}</Content>}</Suspense>
    </div>
  );
}
