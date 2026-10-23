import { css } from "@pochical/styled-system/css";

import { badge } from "./ui";

/** Each way to sign in besides anonymously, as Pochical's people name it. */
const SIGN_IN_NAMES: Record<string, string> = { apple: "Apple" };

/** How a user signs in, as badges: 匿名 alone, or each way besides. */
export function SignIns({
  anonymous,
  signIns,
}: {
  anonymous: boolean;
  signIns: string[];
}) {
  return (
    <span
      className={css({ display: "inline-flex", flexWrap: "wrap", gap: "1" })}
    >
      {anonymous && <span className={badge()}>匿名</span>}
      {signIns.map((signIn) => (
        <span className={badge({ tone: "accent" })} key={signIn}>
          {SIGN_IN_NAMES[signIn] ?? signIn}
        </span>
      ))}
    </span>
  );
}
