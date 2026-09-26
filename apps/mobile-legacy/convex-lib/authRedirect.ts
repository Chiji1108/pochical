export const resolveAuthRedirect = (
  redirectTo: string,
  webOrigin: string | undefined
): string => {
  if (redirectTo === "pochical://auth") {
    return redirectTo;
  }
  if (webOrigin) {
    const origin = new URL(webOrigin);
    const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(
      origin.hostname
    );
    const safeProtocol =
      origin.protocol === "https:" ||
      (origin.protocol === "http:" && isLocalhost);
    const isOriginOnly =
      origin.pathname === "/" &&
      !(origin.search || origin.hash || origin.username || origin.password);
    if (
      safeProtocol &&
      isOriginOnly &&
      redirectTo === `${origin.origin}/account/delete`
    ) {
      return redirectTo;
    }
  }
  throw new Error("Invalid authentication redirect");
};
