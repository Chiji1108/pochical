import { css } from "@pochical/styled-system/css";
import { Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { Form } from "react-router";

import { dialogStyle, fieldStyle, meta } from "./ui";

const KEY = "k";

/**
 * Finding a user by the start of their id, from any page: a button that
 * opens the search (also ⌘K, or Ctrl+K), which asks the user list
 * (/users?q=), and that opens their page when it finds one alone. The
 * button opens it by the browser's own invoker commands, so it works before
 * any JavaScript too.
 */
export function SearchUsers() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      if (event.key === KEY && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        dialogRef.current?.showModal();
      }
    };
    window.addEventListener("keydown", open);
    return () => {
      window.removeEventListener("keydown", open);
    };
  }, []);
  return (
    <>
      <button
        className={css({
          _hover: { background: "fill.tertiary", color: "text.primary" },
          alignItems: "center",
          background: "background.base",
          border: "1px solid",
          borderColor: "border.default",
          borderRadius: "sm",
          color: "text.tertiary",
          // On a narrow screen the ユーザー page's own field finds them.
          display: { base: "none", md: "flex" },
          flexShrink: 0,
          fontSize: "sm",
          gap: "2",
          height: "8",
          paddingInline: "2",
          transition: "background 120ms, color 120ms",
        })}
        command="show-modal"
        commandfor="search-users"
        type="button"
      >
        <Search aria-hidden size={14} strokeWidth={1.75} />
        ユーザーを探す
        <kbd
          className={css({
            fontFamily: "inherit",
            fontSize: "xs",
            marginInlineStart: "auto",
          })}
        >
          ⌘K
        </kbd>
      </button>
      <dialog
        // Toward the top, where the words typed are read, as a command
        // palette sits.
        className={css(dialogStyle, {
          marginTop: "15vh",
          maxWidth: "480px",
          padding: "4",
        })}
        id="search-users"
        ref={dialogRef}
      >
        <search>
          <Form
            action="/users"
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "2",
            })}
            method="get"
            onSubmit={() => dialogRef.current?.close()}
          >
            <input
              aria-label="ユーザー ID の始まり"
              autoComplete="off"
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog is opened to type in it.
              autoFocus
              className={css(fieldStyle, { fontSize: "md", paddingBlock: "3" })}
              name="q"
              placeholder="ユーザー ID の始まり"
              type="search"
            />
            <p className={meta}>
              Enter で探します。一人だけ見つかると、その人のページを開きます。
            </p>
          </Form>
        </search>
      </dialog>
    </>
  );
}
