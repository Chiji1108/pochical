// A person on the server, as the tools that try it are one (chat-try,
// api-try, store-screenshots): signing in, the calls, a group's photos and
// the sync sockets. Each takes the server's origin, since api-try talks to
// production too.

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";

import {
  ClientFrameSchema,
  ServerFrameSchema,
} from "../apps/server/src/gen/pochical/v1/sync_pb";
import type {
  Change,
  RefusedSend_Reason,
} from "../apps/server/src/gen/pochical/v1/sync_pb";
import { CURRENT_PROTOCOL_VERSION } from "../apps/server/src/protocol";

/** The group's own chat, 全体チャット. */
export const GROUP_THREAD = "group";

/** The user's own socket; a group's is `groupSocket`. */
export const USER_SOCKET = "/v1/me/socket";

export const groupSocket = (groupId: string): string =>
  `/v1/groups/${groupId}/socket`;

const ANSWER_TIMEOUT_MS = 10_000;

// Typed where it is declared, so a call narrows what follows it.
export const fail: (message: string) => never = (message) => {
  console.error(message);
  process.exit(1);
};

/**
 * Waits for the server's answer, failing once it has not come in
 * ANSWER_TIMEOUT_MS (the socket closed, the server gone).
 */
export const inTime = async <T>(answer: Promise<T>): Promise<T> => {
  const late = setTimeout(() => {
    fail("no answer from the server");
  }, ANSWER_TIMEOUT_MS);
  try {
    return await answer;
  } finally {
    clearTimeout(late);
  }
};

/** A Connect JSON call, as the apps make one. */
export const rpc = async (
  origin: string,
  method: string,
  body: Record<string, unknown>,
  token?: string
): Promise<Record<string, unknown>> => {
  const response = await fetch(`${origin}/pochical.v1.${method}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
    method: "POST",
  });
  const data: unknown = await response.json();
  if (!response.ok || typeof data !== "object" || data === null) {
    return fail(`${method}: ${response.status} ${JSON.stringify(data)}`);
  }
  return Object.fromEntries(Object.entries(data));
};

/** A field of a call's answer that is always text. */
export const textOf = (
  answer: Record<string, unknown>,
  field: string
): string => {
  const value = answer[field];
  return typeof value === "string"
    ? value
    : fail(`no ${field} in ${JSON.stringify(answer)}`);
};

/** A new anonymous user. */
export const signIn = async (
  origin: string
): Promise<{ token: string; userId: string }> => {
  const response = await fetch(`${origin}/api/auth/sign-in/anonymous`, {
    body: "{}",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const token = response.headers.get("set-auth-token");
  const body: unknown = await response.json();
  const user =
    typeof body === "object" && body !== null && "user" in body
      ? body.user
      : undefined;
  const userId =
    typeof user === "object" && user !== null && "id" in user
      ? user.id
      : undefined;
  if (!response.ok || token === null || typeof userId !== "string") {
    return fail(`sign-in: ${response.status} ${JSON.stringify(body)}`);
  }
  return { token, userId };
};

/** One JPEG put among the group's photos as the user's, by its new id. */
export const upload = async (
  origin: string,
  { bytes, file }: { bytes: Uint8Array<ArrayBuffer>; file: string },
  groupId: string,
  token: string
): Promise<string> => {
  const id = crypto.randomUUID();
  const response = await fetch(`${origin}/v1/groups/${groupId}/photos/${id}`, {
    body: bytes,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "image/jpeg",
    },
    method: "PUT",
  });
  if (!response.ok) {
    const answer = await response.text();
    fail(`upload ${file}: ${response.status} ${answer}`);
  }
  return id;
};

const lost = (): void => {
  fail("socket: could not connect, or the connection was lost");
};

/** What a device sends on a sync socket: a ClientFrame's kind. */
export type Sending = MessageInitShape<typeof ClientFrameSchema>["kind"];

/**
 * A sync socket at `path` past Hello and Welcome, catching up from the
 * start: each change goes to `onChange` as it comes. A ServerError or a
 * lost connection fails.
 */
export const openSocket = async (
  origin: string,
  path: string,
  token: string,
  onChange: (change: Change) => void
) => {
  const socket = new WebSocket(`${origin.replace(/^http/u, "ws")}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  socket.binaryType = "arraybuffer";
  const send = (kind: Sending): void => {
    socket.send(
      toBinary(ClientFrameSchema, create(ClientFrameSchema, { kind }))
    );
  };

  const welcomed = Promise.withResolvers<undefined>();
  // The server's answer to each edit by its op_id, asked for before or
  // after it came: why it refused the edit, or nothing.
  const answers = new Map<
    string,
    PromiseWithResolvers<RefusedSend_Reason | undefined>
  >();
  const answerOf = (opId: string) => {
    const answer =
      answers.get(opId) ??
      Promise.withResolvers<RefusedSend_Reason | undefined>();
    answers.set(opId, answer);
    return answer;
  };
  // Each Ping's Pong, by its nonce.
  const pongs = new Map<number, PromiseWithResolvers<undefined>>();

  socket.addEventListener("open", () => {
    send({
      case: "hello",
      value: { cursor: 0n, protocolVersion: CURRENT_PROTOCOL_VERSION },
    });
  });
  socket.addEventListener("message", (event) => {
    if (!(event.data instanceof ArrayBuffer)) {
      return;
    }
    const { kind } = fromBinary(ServerFrameSchema, new Uint8Array(event.data));
    if (kind.case === "welcome") {
      welcomed.resolve(undefined);
    } else if (kind.case === "pong") {
      pongs.get(kind.value.nonce)?.resolve(undefined);
    } else if (kind.case === "changes") {
      for (const change of kind.value.changes) {
        onChange(change);
      }
    } else if (kind.case === "acked") {
      const refused = new Map(
        kind.value.refused.map(({ opId, reason }) => [opId, reason])
      );
      for (const opId of kind.value.opIds) {
        answerOf(opId).resolve(refused.get(opId));
      }
    } else if (kind.case === "error") {
      fail(`server: ${JSON.stringify(kind.value)}`);
    }
  });
  socket.addEventListener("error", lost);
  await inTime(welcomed.promise);

  return {
    /**
     * The server's Acked for the edit of this op_id: why it refused it,
     * or nothing. Its Changes for the edit have come by then.
     */
    answered: async (opId: string): Promise<RefusedSend_Reason | undefined> =>
      await answerOf(opId).promise,
    /** Everything the server held when asked has come: a Ping's Pong. */
    caughtUp: async (): Promise<void> => {
      const nonce = pongs.size + 1;
      const pong = Promise.withResolvers<undefined>();
      pongs.set(nonce, pong);
      send({ case: "ping", value: { nonce } });
      await inTime(pong.promise);
    },
    /**
     * Closed once the server has answered: what the socket says as it
     * closes is no longer a failure.
     */
    close: (): void => {
      socket.removeEventListener("error", lost);
      socket.close();
    },
    send,
  };
};

export type SyncSocket = Awaited<ReturnType<typeof openSocket>>;
