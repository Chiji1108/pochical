import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";

import { appleAuthProvider } from "../convex-lib/appleAuthProvider";
import { resolveAuthRedirect } from "../convex-lib/authRedirect";
import { nativeAuthProvider } from "../convex-lib/nativeAuthProvider";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Anonymous,
    nativeAuthProvider("apple"),
    nativeAuthProvider("google"),
    appleAuthProvider(),
    Google({ allowDangerousEmailAccountLinking: false }),
  ],
  callbacks: {
    beforeSessionCreation: async (ctx, { userId }) => {
      const user = await ctx.db.get(userId);
      const owner = user?.workspaceId
        ? await ctx.db.get(user.workspaceId)
        : user;
      if (
        !(user && owner) ||
        user.deletingAt !== undefined ||
        owner.deletingAt !== undefined
      ) {
        throw new Error("アカウントを削除中です。");
      }
    },
    redirect: ({ redirectTo }) =>
      Promise.resolve(
        resolveAuthRedirect(redirectTo, process.env.POCHICAL_WEB_ORIGIN)
      ),
  },
});
