import { createContext, use } from "react";

export const AccountSignOutContext = createContext<
  (() => Promise<void>) | null
>(null);

export const useAccountSignOut = () => {
  const signOut = use(AccountSignOutContext);
  if (!signOut) {
    throw new Error("Missing account session provider");
  }
  return signOut;
};
