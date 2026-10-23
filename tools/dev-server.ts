// Where `mise run server` listens: POCHICAL_DEV_SERVER, as the iOS Debug
// build's setting of that name, or the server's own default port.
export const devServer =
  process.env.POCHICAL_DEV_SERVER ?? "http://localhost:8787";
