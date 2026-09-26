/**
 * Socket protocol versions the server accepts. Native apps cannot be
 * updated over the air, so old builds keep connecting for months; raise
 * MIN only when a wire change cannot be handled for older clients.
 */
export const MIN_PROTOCOL_VERSION = 1;
export const CURRENT_PROTOCOL_VERSION = 1;
