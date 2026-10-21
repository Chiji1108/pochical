import { env } from "cloudflare:workers";

export const load = async () => ({ chats: await env.SERVER.supportChats() });
