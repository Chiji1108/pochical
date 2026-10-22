import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";

export const source = loader({
  baseUrl: "/design",
  source: docs.toFumadocsSource(),
});
