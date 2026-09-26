import { create } from "@bufbuild/protobuf";
import { timestampNow } from "@bufbuild/protobuf/wkt";
import type { ConnectRouter } from "@connectrpc/connect";

import {
  GetServerInfoResponseSchema,
  SystemService,
} from "./gen/pochical/v1/system_pb";
import { CURRENT_PROTOCOL_VERSION, MIN_PROTOCOL_VERSION } from "./protocol";

export const registerSystemService = (router: ConnectRouter): void => {
  router.service(SystemService, {
    getServerInfo: () =>
      create(GetServerInfoResponseSchema, {
        currentProtocolVersion: CURRENT_PROTOCOL_VERSION,
        minProtocolVersion: MIN_PROTOCOL_VERSION,
        serverTime: timestampNow(),
      }),
  });
};
