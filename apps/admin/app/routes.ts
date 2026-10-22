import { index, route } from "@react-router/dev/routes";
import type { RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/support-chats.tsx"),
  route("support/:userId", "routes/support-chat.tsx"),
  route("photos/:userId/:photoId", "routes/photo.ts"),
  route("reports", "routes/reports.tsx"),
  route("users", "routes/users.tsx"),
  route("users/:userId", "routes/user.tsx"),
  route("actions", "routes/actions.tsx"),
  route("bucket", "routes/bucket.tsx"),
  route("reset", "routes/reset.tsx"),
] satisfies RouteConfig;
