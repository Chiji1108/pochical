import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { ConnectRouter } from "@connectrpc/connect";
import { env, waitUntil } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { reports } from "./db/schema";
import {
  ChatService,
  GetLinkPreviewResponseSchema,
  ReportReason,
  ReportResponseSchema,
} from "./gen/pochical/v1/chat_pb";
import { linkPreview, mayFetch } from "./link-preview";
import { isMemberOf } from "./membership";
import { overLimit } from "./rate-limits";
import { requireUser } from "./session";
import { slackSetUp, tellStaffOfReport } from "./slack";

/** Each reason as a report keeps it. */
const REASONS: Partial<Record<ReportReason, string>> = {
  [ReportReason.SPAM]: "spam",
  [ReportReason.HARASSMENT]: "harassment",
  [ReportReason.EXPLICIT]: "explicit",
  [ReportReason.IMPERSONATION]: "impersonation",
  [ReportReason.OTHER]: "other",
};

/** A report told in Slack, its message kept to go with it. */
const postReport = async (
  id: string,
  report: Parameters<typeof tellStaffOfReport>[2]
): Promise<void> => {
  const slackTs = await tellStaffOfReport(env, id, report);
  if (slackTs !== undefined) {
    await drizzle(env.DB)
      .update(reports)
      .set({ slackTs })
      .where(eq(reports.id, id))
      .run();
  }
};

export const registerChatService = (router: ConnectRouter): void => {
  router.service(ChatService, {
    getLinkPreview: async ({ url }, context) => {
      const user = await requireUser(context);
      if (await overLimit(env.LINK_PREVIEW_LIMIT, user.id)) {
        throw new ConnectError("Try again in a minute", Code.ResourceExhausted);
      }
      const link = URL.parse(url);
      if (link === null || !mayFetch(link)) {
        throw new ConnectError("Not a link to read", Code.InvalidArgument);
      }
      const preview = await linkPreview(env.PHOTOS, link);
      return create(GetLinkPreviewResponseSchema, {
        preview: preview ?? undefined,
      });
    },
    report: async ({ groupId, reason, target }, context) => {
      const user = await requireUser(context);
      const why = REASONS[reason];
      if (why === undefined || target.case === undefined) {
        throw new ConnectError("Say why and what", Code.InvalidArgument);
      }
      // Only a member reports, and an id that is not theirs wakes no Group DO.
      if (!(await isMemberOf(env, user.id, groupId))) {
        throw new ConnectError("Nothing to report", Code.NotFound);
      }
      const reported = await env.GROUPS.getByName(groupId).reportContext(
        user.id,
        target.case === "line"
          ? { seq: Number(target.value.seq), threadId: target.value.threadId }
          : { userId: target.value }
      );
      if (reported === null) {
        throw new ConnectError("Nothing to report", Code.NotFound);
      }
      const id = crypto.randomUUID();
      await drizzle(env.DB)
        .insert(reports)
        .values({
          context: reported.context,
          createdAt: new Date(),
          groupId,
          id,
          reason: why,
          reporterId: user.id,
          seq: target.case === "line" ? Number(target.value.seq) : null,
          slackTried: slackSetUp(env),
          targetId: reported.targetId,
          threadId: target.case === "line" ? target.value.threadId : null,
        })
        .run();
      waitUntil(postReport(id, { ...reported, why }));
      return create(ReportResponseSchema, {});
    },
  });
};
