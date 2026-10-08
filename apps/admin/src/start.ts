import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

// Server functions answer only the site's own pages: a page elsewhere,
// even one a signed-in person has open, cannot send an answer through them.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}));
