const INVITE_SCHEME = "pochical:";
const INVITE_PATH_SEGMENT = "invite";
const TRAILING_SLASH_REGEX = /\/$/;

const getConfiguredInviteBaseUrl = (): string => {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_INVITE_BASE_URL;

  return configuredBaseUrl?.replace(TRAILING_SLASH_REGEX, "") ?? "";
};

const getInviteCodeFromSegments = (segments: string[]): string | undefined => {
  const inviteSegmentIndex = segments.indexOf(INVITE_PATH_SEGMENT);

  if (inviteSegmentIndex < 0) {
    return;
  }

  return segments.at(inviteSegmentIndex + 1);
};

const getConfiguredBasePathSegments = (): string[] => {
  const configuredBaseUrl = getConfiguredInviteBaseUrl();

  if (!configuredBaseUrl) {
    return [];
  }

  try {
    return new URL(configuredBaseUrl).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
};

const hasConfiguredBasePath = (segments: string[]): boolean => {
  const baseSegments = getConfiguredBasePathSegments();

  if (baseSegments.length === 0) {
    return true;
  }

  return baseSegments.every((segment, index) => segments[index] === segment);
};

export const getInviteCodeFromInviteUrl = (
  value: string
): string | undefined => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return;
  }

  try {
    const url = new URL(trimmedValue);

    if (url.protocol === INVITE_SCHEME) {
      const segments = [url.hostname, ...url.pathname.split("/")]
        .map((segment) => segment.trim())
        .filter(Boolean);
      return getInviteCodeFromSegments(segments);
    }

    if (!(url.protocol === "https:" || url.protocol === "http:")) {
      return;
    }

    const configuredBaseUrl = getConfiguredInviteBaseUrl();

    if (configuredBaseUrl) {
      const baseUrl = new URL(configuredBaseUrl);

      if (url.origin !== baseUrl.origin) {
        return;
      }
    }

    const segments = url.pathname.split("/").filter(Boolean);

    if (!hasConfiguredBasePath(segments)) {
      return;
    }

    return getInviteCodeFromSegments(segments);
  } catch {
    return;
  }
};
