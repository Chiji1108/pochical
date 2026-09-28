// Signing in with Apple or Google, so the same data follows a new phone or
// a second device. The prototype only pretends: nothing leaves the page.

import { css, cva } from "styled-system/css";

export type AccountProvider = "apple" | "google";

export type Account = { provider: AccountProvider; email: string };

export const providerNames: Record<AccountProvider, string> = {
  apple: "Apple",
  google: "Google",
};

// What each provider hands back in the prototype.
export const sampleEmails: Record<AccountProvider, string> = {
  apple: "x7k2m9q4@privaterelay.appleid.com",
  google: "sakura@example.com",
};

export function AppleLogo({ size }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

// Google's four-color G, which its sign-in guidelines ask to keep as is.
export function GoogleLogo({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" height={size} viewBox="0 0 48 48" width={size}>
      <path
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        fill="#EA4335"
      />
      <path
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        fill="#4285F4"
      />
      <path
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        fill="#FBBC05"
      />
      <path
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        fill="#34A853"
      />
    </svg>
  );
}

export function ProviderLogo({
  provider,
  size,
}: {
  provider: AccountProvider;
  size: number;
}) {
  return provider === "apple" ? (
    <AppleLogo size={size} />
  ) : (
    <GoogleLogo size={size} />
  );
}

// The two ways in, in each provider's own colors as their guidelines ask:
// Apple's black (white in dark mode), Google's white with an outline.
const providerButton = {
  button: cva({
    base: {
      _disabled: { opacity: 0.6 },
      alignItems: "center",
      borderRadius: "14px",
      display: "flex",
      fontSize: "16px",
      fontWeight: 600,
      gap: "10px",
      justifyContent: "center",
      minHeight: "50px",
      width: "100%",
    },
    variants: {
      provider: {
        apple: {
          bg: "light-dark(#000000, #ffffff)",
          border: 0,
          color: "light-dark(#ffffff, #000000)",
        },
        google: {
          bg: "light-dark(#ffffff, #131314)",
          border: "1px solid light-dark(#747775, #8e918f)",
          color: "light-dark(#1f1f1f, #e3e3e3)",
        },
      },
    },
  }),
  column: css({
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginBottom: "14px",
  }),
};

// How long the prototype pretends the provider's sign-in takes.
export const signInMilliseconds = 900;

// Apple, then Google, each saying ログイン中… while its sign-in runs.
export function ProviderButtons({
  busy,
  onPick,
}: {
  busy: AccountProvider | undefined;
  onPick: (provider: AccountProvider) => void;
}) {
  return (
    <div className={providerButton.column}>
      {(["apple", "google"] as const).map((provider) => (
        <button
          className={providerButton.button({ provider })}
          disabled={busy !== undefined}
          key={provider}
          onClick={() => {
            onPick(provider);
          }}
          type="button"
        >
          <ProviderLogo provider={provider} size={19} />
          {busy === provider
            ? "ログイン中…"
            : `${providerNames[provider]}で続ける`}
        </button>
      ))}
    </div>
  );
}
