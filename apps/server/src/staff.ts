// A word to Pochical's people where they already look (spec/admin.md): a
// message on their Discord channel through its webhook, with the way to
// the admin page. Never in the way of what the user did: it is sent after
// the answer (waitUntil), and one that fails is dropped.

type StaffEnv = Env & { DISCORD_WEBHOOK_URL?: string };

/** Pochical's people's admin site (apps/admin). */
export const ADMIN_SITE = "https://admin.pochical.app";

export const tellStaff = async (
  env: StaffEnv,
  content: string
): Promise<void> => {
  const webhook = env.DISCORD_WEBHOOK_URL;
  if (webhook === undefined || webhook === "") {
    return;
  }
  try {
    await fetch(webhook, {
      body: JSON.stringify({ allowed_mentions: { parse: [] }, content }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch {
    // The user's line is kept whatever Discord says.
  }
};
