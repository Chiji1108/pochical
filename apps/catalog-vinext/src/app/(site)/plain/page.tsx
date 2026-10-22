import { css } from "@pochical/styled-system/css";
import Link from "next/link";

// A page outside the documents, with Panda CSS only: after a client-side
// visit from /design, Tailwind's preflight must not be on it.
export default function Plain() {
  return (
    <main className={css({ padding: "32px" })}>
      <h1 className={css({ fontSize: "2xl", fontWeight: "bold" })}>
        Plain page
      </h1>
      <button
        className={css({ marginBlock: "16px" })}
        data-probe="button"
        type="button"
      >
        A button with UA styles
      </button>
      <p>
        <Link href="/design/components">部品の棚卸し</Link>
      </p>
    </main>
  );
}
