import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createAccount } from "@convex-dev/auth/server";
import { internal } from "../convex/_generated/api";
import type { DataModel, Id } from "../convex/_generated/dataModel";
import { type NativeProvider, verifyNativeIdentity } from "./nativeIdentity";

export const nativeAuthProvider = (provider: NativeProvider) =>
  ConvexCredentials<DataModel>({
    id: `${provider}-native`,
    authorize: async (credentials, ctx) => {
      const { idToken, challengeId, secret } = credentials;
      if (
        typeof idToken !== "string" ||
        typeof challengeId !== "string" ||
        typeof secret !== "string" ||
        secret.length > 256
      ) {
        throw new Error("Invalid authentication request");
      }
      const audience =
        provider === "apple"
          ? process.env.AUTH_APPLE_NATIVE_ID
          : process.env.AUTH_GOOGLE_ID;
      if (!audience) {
        throw new Error("ログイン設定がまだ完了していません。");
      }
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(secret)
      );
      const nonce = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");
      const identity = await verifyNativeIdentity(
        provider,
        idToken,
        nonce,
        audience
      );
      await ctx.runMutation(internal.nativeAuth.consume, {
        id: challengeId as Id<"nativeAuthChallenges">,
        provider,
        nonce,
      });
      // Use the same provider/sub as web OAuth, never match accounts by email.
      const { user } = await createAccount(ctx, {
        provider,
        account: { id: identity.id },
        profile: {
          ...(identity.email ? { email: identity.email } : {}),
          isAnonymous: false,
        },
        shouldLinkViaEmail: false,
        shouldLinkViaPhone: false,
      });
      return { userId: user._id };
    },
  });
