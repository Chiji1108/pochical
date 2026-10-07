import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { ConnectRouter } from "@connectrpc/connect";
import { env } from "cloudflare:workers";

import {
  ChatService,
  GetLinkPreviewResponseSchema,
} from "./gen/pochical/v1/chat_pb";
import { linkPreview, mayRead } from "./link-preview";
import { overLimit } from "./rate-limits";
import { requireUser } from "./session";

export const registerChatService = (router: ConnectRouter): void => {
  router.service(ChatService, {
    getLinkPreview: async ({ url }, context) => {
      const user = await requireUser(context);
      if (await overLimit(env.LINK_PREVIEW_LIMIT, user.id)) {
        throw new ConnectError("Try again in a minute", Code.ResourceExhausted);
      }
      const link = URL.parse(url);
      if (link === null || !mayRead(link)) {
        throw new ConnectError("Not a link to read", Code.InvalidArgument);
      }
      const preview = await linkPreview(env.PHOTOS, link);
      return create(GetLinkPreviewResponseSchema, {
        preview: preview ?? undefined,
      });
    },
  });
};
