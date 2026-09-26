export type InvitePreview =
  | { status: "valid"; groupName: string; groupEmoji: string }
  | { status: "invalid" | "unavailable" };
export type InviteFetch = (url: URL, init: RequestInit) => Promise<Response>;
const INVITE_CODE = /^[A-HJ-NP-Za-km-z2-9]{8}$/;

export async function fetchInvitePreview(
  code: string,
  baseUrl: string | undefined,
  request: InviteFetch = fetch
): Promise<InvitePreview> {
  if (!INVITE_CODE.test(code)) {
    return { status: "invalid" };
  }
  if (!baseUrl) {
    return { status: "unavailable" };
  }
  try {
    const url = new URL("/invite-preview", baseUrl);
    if (url.protocol !== "https:") {
      return { status: "unavailable" };
    }
    url.searchParams.set("inviteCode", code);
    const response = await request(url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404 || response.status === 400) {
      return { status: "invalid" };
    }
    if (!response.ok) {
      return { status: "unavailable" };
    }
    const data: unknown = await response.json();
    if (
      typeof data !== "object" ||
      data === null ||
      !("ok" in data) ||
      data.ok !== true ||
      !("groupName" in data) ||
      typeof data.groupName !== "string" ||
      !("groupEmoji" in data) ||
      typeof data.groupEmoji !== "string"
    ) {
      return { status: "unavailable" };
    }
    return {
      groupEmoji: data.groupEmoji,
      groupName: data.groupName,
      status: "valid",
    };
  } catch {
    return { status: "unavailable" };
  }
}
