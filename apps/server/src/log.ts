// The server logs one object per line, `{ message, error, ...context }`,
// so Workers Logs indexes each field and a query can filter by it
// (https://developers.cloudflare.com/workers/observability/logs/workers-logs/#logging-structured-json-objects).

/**
 * A caught error as plain fields for a logged object: an Error held in an
 * object is serialized as `{}`, losing its message and stack.
 */
export const errorFields = (
  error: unknown
): { name?: string; message: string; stack?: string } =>
  error instanceof Error
    ? { message: error.message, name: error.name, stack: error.stack }
    : { message: String(error) };
