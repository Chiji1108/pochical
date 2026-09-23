import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";

import { appleAuthProvider } from "../convex-lib/appleAuthProvider";
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
    redirect: ({ redirectTo }) => {
      if (redirectTo === "pochical://auth") {
        return Promise.resolve(redirectTo);
      }
      throw new Error("Invalid authentication redirect");
    },
  },
});
