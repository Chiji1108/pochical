import { createToaster, Toast, Toaster } from "@ark-ui/react";
import { Check, CircleAlert } from "lucide-react";
import { createContext, useState } from "react";
import { css } from "styled-system/css";

// A short line that says something was done and goes away by itself, as
// Compose's Snackbar: saved, imported. A `problem` says, just as briefly,
// that something did not work and is simply tried again, like a QR code
// that is not an invitation; one that needs more than a retry stays on
// its screen instead. Each phone keeps its own, so the
// phones side by side on /design/flows do not share their notes.

const toastDuration = 2400;

// Says a line on the phone the caller is in.
export type ToastKind = "done" | "problem";

export const ToastContext = createContext<
  (title: string, kind?: ToastKind) => void
>(() => {
  // Outside a phone there is nowhere to say it.
});

const toastStyle = {
  // Ark places the group fixed to the window; here it belongs to the
  // phone, above its home bar, and above a sheet's bottom buttons while
  // one marked data-toast-above is open.
  group: css({
    "--toast-bottom": "40px",
    ".dc-phone:has([data-toast-above]) &": { "--toast-bottom": "126px" },
    position: "absolute!",
  }),
  root: css({
    "&[data-state=closed]": {
      transition: "translate 0.3s, opacity 0.2s",
    },
    alignItems: "center",
    bg: "var(--inverse-background)",
    borderRadius: "xl",
    color: "var(--inverse-text)",
    display: "flex",
    gap: "8px",
    opacity: "var(--opacity)",
    padding: "12px 16px",
    textStyle: "subheadline",
    transition: "translate 0.3s, opacity 0.3s",
    transitionTimingFunction: "cubic-bezier(0.21, 1.02, 0.73, 1)",
    translate: "var(--x) var(--y)",
    whiteSpace: "nowrap",
    zIndex: "var(--z-index)",
  }),
};

// The look alone, for /design/components.
export const toastLook = toastStyle.root;

// A phone's own toaster, and the way its screens say a line on it.
export function usePhoneToaster() {
  const [toaster] = useState(() =>
    createToaster({
      duration: toastDuration,
      offsets: {
        bottom: "var(--toast-bottom)",
        left: "0px",
        right: "0px",
        top: "0px",
      },
      placement: "bottom",
    })
  );
  const say = (title: string, kind: ToastKind = "done") => {
    // A new line takes the place of the one showing.
    toaster.dismiss();
    toaster.create({ title, type: kind === "done" ? "success" : "warning" });
  };
  return { say, toaster };
}

// The lines, at the bottom of the phone. Put it inside the phone.
export function PhoneToasts({
  toaster,
}: {
  toaster: ReturnType<typeof usePhoneToaster>["toaster"];
}) {
  return (
    <Toaster className={toastStyle.group} toaster={toaster}>
      {(toast) => (
        <Toast.Root className={toastStyle.root} key={toast.id}>
          {toast.type === "warning" ? (
            <CircleAlert aria-hidden="true" size={16} />
          ) : (
            <Check aria-hidden="true" size={16} />
          )}
          <Toast.Title>{toast.title}</Toast.Title>
        </Toast.Root>
      )}
    </Toaster>
  );
}
