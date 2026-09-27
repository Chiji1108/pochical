import { createToaster, Toast, Toaster } from "@ark-ui/react";
import { Check } from "lucide-react";
import { createContext, useState } from "react";
import { css } from "styled-system/css";

// A short line that says something was done and goes away by itself, as
// Compose's Snackbar: saved, imported. Each phone keeps its own, so the
// phones side by side on /design/flows do not share their notes.

const toastDuration = 2400;

// Says a line on the phone the caller is in.
export const ToastContext = createContext<(title: string) => void>(() => {
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
    bg: "var(--inverse)",
    borderRadius: "20px",
    color: "var(--on-inverse)",
    display: "flex",
    fontSize: "13px",
    gap: "6px",
    opacity: "var(--opacity)",
    padding: "10px 16px",
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
  const say = (title: string) => {
    // A new line takes the place of the one showing.
    toaster.dismiss();
    toaster.create({ title, type: "success" });
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
          <Check aria-hidden="true" size={16} />
          <Toast.Title>{toast.title}</Toast.Title>
        </Toast.Root>
      )}
    </Toaster>
  );
}
