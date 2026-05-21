import presence from "@convex-dev/presence/convex.config";
import { defineApp } from "convex/server";
import unreadTracking from "convex-unread-tracking/convex.config";

const app = defineApp();

app.use(presence);
app.use(unreadTracking);

export default app;
