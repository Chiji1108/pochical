// OAuth completion can precede the React client's authentication handshake.
// Share the token from the supported useAuthToken hook with the callback flow.
let activeToken: string | null = null;
const listeners = new Set<() => void>();
export const publishAuthToken = (token: string | null) => {
  activeToken = token;
  for (const listener of listeners) {
    listener();
  }
};
export const getActiveAuthToken = () => activeToken;
export const waitForAuthToken = (previous: string | null): Promise<string> => {
  if (activeToken && activeToken !== previous) {
    return Promise.resolve(activeToken);
  }
  return new Promise((resolve, reject) => {
    const check = () => {
      if (activeToken && activeToken !== previous) {
        clearTimeout(timer);
        listeners.delete(check);
        resolve(activeToken);
      }
    };
    const timer = setTimeout(() => {
      listeners.delete(check);
      reject(new Error("認証の反映を待っています。もう一度お試しください。"));
    }, 15_000);
    listeners.add(check);
  });
};
