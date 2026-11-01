import { Code, ConnectError } from "@connectrpc/connect";

// How a call's text is held to what the server takes of it
// (design/src/values.ts, spec/vectors/fits.json), counted as
// spec/text-limits.md has it.

/**
 * The text, when `fits` takes it; INVALID_ARGUMENT naming `field`
 * otherwise. The server never cuts text itself.
 */
export const requireFit = (
  text: string,
  fits: (text: string) => boolean,
  field: string
): string => {
  if (!fits(text)) {
    throw new ConnectError(`${field} does not fit`, Code.InvalidArgument);
  }
  return text;
};
