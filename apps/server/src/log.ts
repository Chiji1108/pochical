// The server logs one object per line, `{ message, error, ...context }`,
// so Workers Logs indexes each field and a query can filter by it
// (https://developers.cloudflare.com/workers/observability/logs/workers-logs/#logging-structured-json-objects).

/** A caught error as a logged object holds it. */
export type ErrorFields = {
  name?: string;
  message: string;
  stack?: string;
  // What it wraps: Drizzle's failed query, for one, holds D1's reason here.
  cause?: ErrorFields;
};

/**
 * A caught error as plain fields for a logged object: an Error held in an
 * object is serialized as `{}`, losing its message, stack and cause.
 */
export const errorFields = (error: unknown): ErrorFields => {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  const { cause, message, name, stack } = error;
  return {
    message,
    name,
    stack,
    ...(cause === undefined ? {} : { cause: errorFields(cause) }),
  };
};
