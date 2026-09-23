import Apple from "@auth/core/providers/apple";
import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";

import { nativeAuthProvider } from "../convex-lib/nativeAuthProvider";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Anonymous,
    nativeAuthProvider("apple"),
    nativeAuthProvider("google"),
    Apple({
      allowDangerousEmailAccountLinking: false,
      profile: (profile) => ({
        id: profile.sub,
        email: profile.email,
        ...(profile.user?.name
          ? {
              name: `${profile.user.name.firstName} ${profile.user.name.lastName}`.trim(),
            }
          : {}),
      }),
    }),
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
