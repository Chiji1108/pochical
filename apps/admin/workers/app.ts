import { createRequestHandler } from "react-router";

const handle = createRequestHandler(
  async () => await import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  fetch: async (request) => await handle(request),
} satisfies ExportedHandler<Env>;
