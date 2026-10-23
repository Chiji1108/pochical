/**
 * Socket protocol versions the server accepts. Native apps cannot be
 * updated over the air, so old builds keep connecting for months; raise
 * MIN only when a wire change cannot be handled for older clients.
 */
// 2: a preference's value is its key's message (PreferenceValue.message);
// an older build's JSON field would read as the preference cleared.
export const MIN_PROTOCOL_VERSION = 2;
export const CURRENT_PROTOCOL_VERSION = 2;
