import { render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";
import type { RequestInfo } from "rwsdk/worker";

import { Document, HydratedDocument } from "./app/document";
import { Bucket, cleanBucket } from "./app/pages/bucket";
import { photo } from "./app/pages/photo";
import { Reports } from "./app/pages/reports";
import { postAnswer, SupportChat } from "./app/pages/support-chat";
import { SupportChats } from "./app/pages/support-chats";

/**
 * Only this site's own pages may post to it. RedwoodSDK checks the Origin of
 * a server function's request, not of a form's plain POST to a route, so the
 * check is here once for both.
 */
const sameOrigin = ({ request }: RequestInfo) =>
  request.method === "GET" ||
  request.method === "HEAD" ||
  request.headers.get("Origin") === new URL(request.url).origin
    ? undefined
    : new Response("Cross-site POST refused", { status: 403 });

export default defineApp([
  sameOrigin,
  route("/photos/:userId/:photoId", photo),
  render(Document, [
    route("/", SupportChats),
    route("/reports", Reports),
    route("/bucket", { get: Bucket, post: cleanBucket }),
  ]),
  render(HydratedDocument, [
    route("/support/:userId", { get: SupportChat, post: postAnswer }),
  ]),
]);
