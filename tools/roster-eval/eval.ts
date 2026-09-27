// Compares how well vision models read a photographed roster: the names,
// one person's row, and where each sits in the photo.
//
//   bun tools/roster-eval/eval.ts [--models a,b] [--provider vercel] [--images x,y]
//     [--slim | --all-rows] [--effort low]
//     [--rescore]
//
// Reads assets/shift-schedule/*.jpg and answers.json beside them, writes
// tools/roster-eval/out/report.html. Keys come from a .env at the repo root
// (bun loads it): AI_GATEWAY_API_KEY for the models on Vercel AI Gateway,
// and for Cloudflare's own Workers AI models CF_ACCOUNT_ID, CF_GATEWAY_ID,
// CF_AIG_TOKEN and a token allowed to run Workers AI (CF_API_TOKEN, or
// CF_AIG_TOKEN when that one has the permission too).

import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

type Provider = "vercel" | "workers-ai";

type Model = {
  id: string;
  provider: Provider;
  // USD per 1M input and output tokens, as the gateway lists them.
  price: [number, number];
  // For models without structured output: the schema goes in the prompt
  // and the JSON is picked out of the reply.
  schemaInPrompt?: boolean;
};

const models: Model[] = [
  {
    id: "anthropic/claude-opus-5.5",
    price: [4, 20],
    provider: "vercel",
    schemaInPrompt: true,
  },
  { id: "anthropic/claude-opus-5", price: [5, 25], provider: "vercel" },
  { id: "anthropic/claude-sonnet-5", price: [2, 10], provider: "vercel" },
  { id: "anthropic/claude-haiku-4.5", price: [1, 5], provider: "vercel" },
  { id: "openai/gpt-6-astra", price: [10, 50], provider: "vercel" },
  { id: "openai/gpt-6-sol", price: [2, 10], provider: "vercel" },
  { id: "openai/gpt-6-luna", price: [0.1, 0.5], provider: "vercel" },
  { id: "google/gemini-3.8-flash", price: [0.75, 3.75], provider: "vercel" },
  { id: "google/gemini-3.5-flash-lite", price: [0.3, 2.5], provider: "vercel" },
  { id: "moonshotai/kimi-k2.6", price: [0.95, 4], provider: "vercel" },
  { id: "zai/glm-5v-turbo", price: [1.2, 4], provider: "vercel" },
  {
    id: "alibaba/qwen3-vl-235b-a22b-instruct",
    price: [0.4, 1.6],
    provider: "vercel",
    schemaInPrompt: true,
  },
  // Open models Cloudflare runs itself, billed to the Workers plan.
  {
    id: "@cf/moonshotai/kimi-k2.6",
    price: [0.95, 4],
    provider: "workers-ai",
    schemaInPrompt: true,
  },
  {
    id: "@cf/zai-org/glm-5.3-flash",
    price: [0.15, 0.5],
    provider: "workers-ai",
    schemaInPrompt: true,
  },
  {
    id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    price: [0.27, 0.85],
    provider: "workers-ai",
    schemaInPrompt: true,
  },
  {
    id: "@cf/mistralai/mistral-small-3.1-24b-instruct",
    price: [0.351, 0.555],
    provider: "workers-ai",
    schemaInPrompt: true,
  },
];

const root = path.join(import.meta.dir, "../..");
const photos = path.join(root, "assets/shift-schedule");
// --slim reads only the person's own row: no names, no positions, as a
// returning person's import would. --effort sets how much reasoning
// models think. Each variant keeps its own report beside the full one.
const slim = process.argv.includes("--slim");
// --all-rows has every person's row written out top to bottom, names and
// codes and nothing else, and picks the person's row here, by the name
// closest to the one they typed.
const allRows = process.argv.includes("--all-rows");
const effortIndex = process.argv.indexOf("--effort");
const effort = effortIndex === -1 ? undefined : process.argv[effortIndex + 1];
const variant = [slim ? "slim" : "", allRows ? "rows" : "", effort ?? ""]
  .filter(Boolean)
  .join("-");
const out = path.join(
  import.meta.dir,
  variant === "" ? "out" : `out/${variant}`
);
// Long edge sent to every model, so they all see the same pixels.
const LONG_EDGE = 2000;
const CONCURRENCY = 4;
const TIMEOUT_MS = 15 * 60 * 1000;

// [x_min, y_min, x_max, y_max], the photo's top left 0,0, bottom right
// 1000,1000: the same frame whatever size a provider resizes to.
type Box = number[];

type Reading = {
  year: number;
  month: number;
  people: { name: string; name_unsure: boolean; box: Box }[];
  target: {
    name: string;
    row_box: Box;
    days: { day: number; code: string; unsure: boolean; box: Box }[];
  };
};

type Answer = {
  // A case can read another case's photo, turned, to see what turning
  // it first changes: the photo's file and the degrees clockwise to turn
  // it after its own orientation. Unset fields come from that case.
  file?: string;
  turn?: number;
  year: number;
  month: number;
  target: string;
  names: string[];
  days: string[] | null;
};

const box = {
  description: "[x_min, y_min, x_max, y_max], 0-1000",
  items: { type: "number" },
  type: "array",
};

const schema = {
  additionalProperties: false,
  properties: {
    month: { type: "integer" },
    people: {
      items: {
        additionalProperties: false,
        properties: {
          box,
          name: { type: "string" },
          name_unsure: { type: "boolean" },
        },
        required: ["name", "name_unsure", "box"],
        type: "object",
      },
      type: "array",
    },
    target: {
      additionalProperties: false,
      properties: {
        days: {
          items: {
            additionalProperties: false,
            properties: {
              box,
              code: { type: "string" },
              day: { type: "integer" },
              unsure: { type: "boolean" },
            },
            required: ["day", "code", "unsure", "box"],
            type: "object",
          },
          type: "array",
        },
        name: { type: "string" },
        row_box: box,
      },
      required: ["name", "row_box", "days"],
      type: "object",
    },
    year: { type: "integer" },
  },
  required: ["year", "month", "people", "target"],
  type: "object",
};

// The slim reply: the year, the month and the person's row.
const slimSchema = {
  additionalProperties: false,
  properties: {
    days: {
      items: {
        additionalProperties: false,
        properties: {
          code: { type: "string" },
          day: { type: "integer" },
          unsure: { type: "boolean" },
        },
        required: ["day", "code", "unsure"],
        type: "object",
      },
      type: "array",
    },
    month: { type: "integer" },
    name: { type: "string" },
    year: { type: "integer" },
  },
  required: ["year", "month", "name", "days"],
  type: "object",
};

const slimPrompt = (
  target: string
) => `この写真は職場の勤務表です。「${target}」の行を読んで、次の内容をJSONで返してください。

- year, month: 勤務表の年と月。
- name: 読んだ行の氏名を、写真に書かれているとおりに。
- days: 1日から月末まで順に、その人の「予定」の行の各セルに書かれた記号をそのまま入れる（○、公、夜、勤、年、P公、遅② など。空欄は空文字）。「実績」の行、右端や下端の集計は含めない。unsure はそのセルの読み取りに自信がなければ true。`;

const fullPrompt = (
  target: string
) => `この写真は職場の勤務表です。次の内容をJSONで返してください。

- year, month: 勤務表の年と月。
- people: 表に並ぶ全員の氏名を、上から順に。職種や番号は除き、姓と名の間は半角スペース1つ。name_unsure は読み取りに自信がなければ true。box はその氏名が書かれたセルの位置。
- target: 「${target}」の行。days には1日から月末まで順に、その人の「予定」の行の各セルに書かれた記号をそのまま入れる（○、公、夜、勤、年、P公、遅② など。空欄は空文字）。「実績」の行、右端や下端の集計は含めない。unsure はそのセルの読み取りに自信がなければ true。box はそのセルの位置、row_box は予定の行全体の位置。

位置はすべて [x_min, y_min, x_max, y_max] の整数で、写真の左上を (0, 0)、右下を (1000, 1000) とする座標で答えてください。写真が回転していても、写真そのものの座標で答えてください。`;

const rowsSchema = {
  additionalProperties: false,
  properties: {
    month: { type: "integer" },
    rows: {
      items: {
        additionalProperties: false,
        properties: {
          codes: { items: { type: "string" }, type: "array" },
          name: { type: "string" },
        },
        required: ["name", "codes"],
        type: "object",
      },
      type: "array",
    },
    year: { type: "integer" },
  },
  required: ["year", "month", "rows"],
  type: "object",
};

const rowsPrompt =
  () => `この写真は職場の勤務表です。表の全員の「予定」の行を、上から順にすべて書き写してJSONで返してください。

- year, month: 勤務表の年と月。
- rows: 1人につき1つ、表の上から順に。name は氏名を写真に書かれているとおりに（職種や番号は除く）。codes は1日から月末まで順に、予定の行の各セルの記号をそのまま（○、公、夜、勤、年、P公、遅② など。空欄は空文字）。「実績」の行、右端や下端の集計は含めない。`;

function replyShape() {
  if (allRows) {
    return { prompt: rowsPrompt, schema: rowsSchema };
  }
  if (slim) {
    return { prompt: slimPrompt, schema: slimSchema };
  }
  return { prompt: fullPrompt, schema };
}
const { prompt, schema: replySchema } = replyShape();

type Call = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

function env(name: string) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set (see the top of eval.ts)`);
  }
  return value;
}

async function post<Reply>(
  url: string,
  body: unknown,
  headers: Record<string, string>
) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the reply as the provider documents it; a wrong shape throws below.
  return data as Reply;
}

type ChatReply = {
  choices?: {
    finish_reason?: string;
    message?: { content?: string | null };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

// One OpenAI-style chat request: the photo, the prompt, and the schema
// either as structured output or, for models without it, in the prompt.
function chatBody(model: Model, image: string, text: string) {
  const content = [
    {
      image_url: { detail: "high", url: `data:image/jpeg;base64,${image}` },
      type: "image_url",
    },
    {
      text:
        model.schemaInPrompt === true
          ? `${text}\n\nJSONだけを返してください。形は次のJSON Schemaに従います。\n${JSON.stringify(replySchema)}`
          : text,
      type: "text",
    },
  ];
  return {
    max_tokens: 32_000,
    ...(effort === undefined ? {} : { reasoning_effort: effort }),
    messages: [{ content, role: "user" }],
    model: model.id,
    ...(model.schemaInPrompt === true
      ? {}
      : {
          response_format: {
            json_schema: { name: "roster", schema: replySchema, strict: true },
            type: "json_schema",
          },
        }),
  };
}

function chatCall(data: ChatReply): Call {
  const choice = data.choices?.[0];
  if (choice?.finish_reason !== "stop") {
    throw new Error(`finish_reason ${choice?.finish_reason ?? "(none)"}`);
  }
  return {
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    text: choice.message?.content ?? "",
  };
}

async function callVercel(model: Model, image: string, text: string) {
  const data = await post<ChatReply>(
    "https://ai-gateway.vercel.sh/v1/chat/completions",
    chatBody(model, image, text),
    { authorization: `Bearer ${env("AI_GATEWAY_API_KEY")}` }
  );
  return chatCall(data);
}

// Workers AI's OpenAI-style endpoint, through Cloudflare's gateway.
async function callWorkersAI(model: Model, image: string, text: string) {
  const data = await post<ChatReply>(
    `https://api.cloudflare.com/client/v4/accounts/${env("CF_ACCOUNT_ID")}/ai/v1/chat/completions`,
    { ...chatBody(model, image, text), max_tokens: 16_000 },
    {
      authorization: `Bearer ${process.env.CF_API_TOKEN ?? env("CF_AIG_TOKEN")}`,
      "cf-aig-authorization": `Bearer ${env("CF_AIG_TOKEN")}`,
      "cf-aig-gateway-id": env("CF_GATEWAY_ID"),
    }
  );
  return chatCall(data);
}

// The JSON in a reply, also when a model wraps it in prose or a fence.
function jsonIn(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  }
}

const callers = {
  vercel: callVercel,
  "workers-ai": callWorkersAI,
};

// Comparing names and codes as a person would: spacing and the several
// round marks don't count as differences.
const plainName = (name: string) =>
  name.normalize("NFKC").replaceAll(/\s/gu, "");
const plainCode = (code: string) =>
  code
    .normalize("NFKC")
    .replaceAll(/[〇◯○]/gu, "○")
    .replaceAll(/\s/gu, "");

function score(reading: Reading, answer: Answer) {
  // A slim reply reads no names, so none are scored.
  const names = slim ? [] : answer.names;
  const read = new Set(reading.people.map((person) => plainName(person.name)));
  const key = new Set(names.map(plainName));
  const missed = names.filter((name) => !read.has(plainName(name)));
  const extra = reading.people
    .map((person) => person.name)
    .filter((name) => !key.has(plainName(name)));
  const unsureNames = reading.people.filter((p) => p.name_unsure).length;
  const byDay = new Map(reading.target.days.map((day) => [day.day, day]));
  const dayErrors: {
    day: number;
    expected: string;
    got: string;
    unsure: boolean;
  }[] = [];
  for (const [index, expected] of (answer.days ?? []).entries()) {
    const got = byDay.get(index + 1);
    if (plainCode(got?.code ?? "") !== plainCode(expected)) {
      dayErrors.push({
        day: index + 1,
        expected,
        got: got?.code ?? "(なし)",
        unsure: got?.unsure ?? false,
      });
    }
  }
  return {
    dayErrors,
    days: answer.days ? answer.days.length - dayErrors.length : undefined,
    daysTotal: answer.days?.length,
    extra,
    missed,
    monthRight: reading.year === answer.year && reading.month === answer.month,
    names: names.length - missed.length,
    namesTotal: names.length,
    unsureDays: reading.target.days.filter((day) => day.unsure).length,
    unsureNames,
  };
}

type Result = {
  image: string;
  model: Model;
  ms: number;
  cost?: number;
  call?: Call;
  reading?: Reading;
  score?: ReturnType<typeof score>;
  error?: string;
};

// The photo as a phone shows it, its EXIF orientation applied to the
// pixels and dropped, so every model and the report see the same image
// the same way up. Shrunk to LONG_EDGE when larger, never enlarged.
async function prepare(name: string, file: string, turn: number) {
  const image = await sharp(file)
    .autoOrient()
    .rotate(turn)
    .resize({
      fit: "inside",
      height: LONG_EDGE,
      width: LONG_EDGE,
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
  await Bun.write(path.join(out, "images", `${name}.jpg`), image);
  return { base64: image.toString("base64") };
}

const textOf = (field: unknown) => (typeof field === "string" ? field : "");
const boxOf = (field: unknown): Box =>
  Array.isArray(field)
    ? field.filter((item): item is number => typeof item === "number")
    : [];

// A reply in the schema's shape. Models whose provider does not enforce
// the schema drift from it (a day's code as "value" or "text", no day
// number), so those are mapped back rather than scored as blanks.
// Letters to change to turn one name into another, spacing aside.
function distance(a: string, b: string) {
  // Names are CJK and kana, whole code points, so spreading is safe here.
  // oxlint-disable-next-line typescript/no-misused-spread
  const from = [...plainName(a)];
  // oxlint-disable-next-line typescript/no-misused-spread
  const to = [...plainName(b)];
  let previous = Array.from({ length: to.length + 1 }, (_, index) => index);
  for (const [i, letter] of from.entries()) {
    const current = [i + 1];
    for (const [j, other] of to.entries()) {
      current.push(
        Math.min(
          (previous[j + 1] ?? 0) + 1,
          (current[j] ?? 0) + 1,
          (previous[j] ?? 0) + (letter === other ? 0 : 1)
        )
      );
    }
    previous = current;
  }
  return previous[to.length] ?? 0;
}

// Every row as read, the person's own picked by the nearest name, as the
// app would pick it from the name they typed.
function rowOf(value: unknown, typed: string): Reading {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- checked field by field below.
  const raw = value as {
    year?: number;
    month?: number;
    rows?: { name?: unknown; codes?: unknown[] }[];
  };
  const rows = (raw.rows ?? []).map((row) => ({
    codes: (row.codes ?? []).map((code) => textOf(code)),
    name: textOf(row.name),
  }));
  let nearest: (typeof rows)[number] | undefined;
  for (const row of rows) {
    if (
      nearest === undefined ||
      distance(row.name, typed) < distance(nearest.name, typed)
    ) {
      nearest = row;
    }
  }
  return {
    month: raw.month ?? 0,
    people: rows.map((row) => ({
      box: [],
      name: row.name,
      name_unsure: false,
    })),
    target: {
      days: (nearest?.codes ?? []).map((code, index) => ({
        box: [],
        code,
        day: index + 1,
        unsure: false,
      })),
      name: nearest?.name ?? "",
      row_box: [],
    },
    year: raw.year ?? 0,
  };
}

function readingOf(value: unknown): Reading {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- checked field by field below.
  const raw = value as {
    year?: number;
    month?: number;
    people?: Record<string, unknown>[];
    days?: (string | Record<string, unknown>)[];
    name?: string;
    target?: {
      name?: string;
      row_box?: Box;
      days?: (string | Record<string, unknown>)[];
    };
  };
  return {
    month: raw.month ?? 0,
    people: (raw.people ?? []).map((person) => ({
      box: boxOf(person.box),
      name: textOf(person.name),
      name_unsure: person.name_unsure === true,
    })),
    target: {
      // A slim reply has the days at the top.
      days: (raw.target?.days ?? raw.days ?? []).map((item, index) => {
        // Some send bare codes, some name the code field their own way.
        const day: Record<string, unknown> =
          typeof item === "string" ? { code: item } : item;
        return {
          box: boxOf(day.box),
          code: textOf(day.code ?? day.value ?? day.text ?? day.symbol),
          day: typeof day.day === "number" ? day.day : index + 1,
          unsure: day.unsure === true,
        };
      }),
      name: raw.target?.name ?? raw.name ?? "",
      row_box: boxOf(raw.target?.row_box),
    },
    year: raw.year ?? 0,
  };
}

// A model's reply as saved in out/raw, to score again without asking.
// Replies saved before timings were kept are the bare text.
type Saved = { call: Call; ms: number };

const rawFile = (image: string, model: Model) =>
  path.join(out, "raw", `${image}__${model.id.replaceAll("/", "_")}.json`);

async function savedReply(image: string, model: Model): Promise<Saved> {
  const text = await Bun.file(rawFile(image, model)).text();
  const saved = jsonIn(text);
  if (typeof saved === "object" && saved !== null && "call" in saved) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- written by this script.
    return saved as Saved;
  }
  return { call: { inputTokens: 0, outputTokens: 0, text }, ms: 0 };
}

async function askModel(
  image: string,
  data: string,
  answer: Answer,
  model: Model
): Promise<Saved> {
  const started = performance.now();
  const call = await callers[model.provider](
    model,
    data,
    prompt(answer.target)
  );
  const saved = { call, ms: performance.now() - started };
  await Bun.write(rawFile(image, model), JSON.stringify(saved));
  return saved;
}

async function run(
  image: string,
  data: string,
  answer: Answer,
  model: Model,
  rescore: boolean
): Promise<Result> {
  const started = performance.now();
  try {
    const { call, ms } = rescore
      ? await savedReply(image, model)
      : await askModel(image, data, answer, model);
    const reading = allRows
      ? rowOf(jsonIn(call.text), answer.target)
      : readingOf(jsonIn(call.text));
    const cost =
      (call.inputTokens * model.price[0] + call.outputTokens * model.price[1]) /
      1_000_000;
    return {
      call,
      cost,
      image,
      model,
      ms,
      reading,
      score: score(reading, answer),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      image,
      model,
      ms: performance.now() - started,
    };
  }
}

async function pool<T>(tasks: (() => Promise<T>)[], size: number) {
  const results: T[] = [];
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      if (task !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- each worker takes one request at a time.
        results.push(await task());
      }
    }
  };
  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

// A case's image file in out/images, its photo's extension dropped.
const imageName = (name: string) => name.replace(/\.\w+$/u, "");

const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function rect(b: Box | undefined, color: string, dashed = false) {
  if (!Array.isArray(b) || b.length !== 4) {
    return "";
  }
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = b;
  return `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"${dashed ? ' stroke-dasharray="4 3"' : ""}/>`;
}

// The boxes a model gave, drawn over the photo it read.
function shapesOf(reading: Reading, wrong: Set<number>) {
  return [
    ...reading.people.map((person) =>
      rect(person.box, person.name_unsure ? "#e0a800" : "#2f6fed")
    ),
    rect(reading.target.row_box, "#f07c00"),
    ...reading.target.days.map((day) =>
      rect(day.box, wrong.has(day.day) ? "#e5243b" : "#1a9e55", day.unsure)
    ),
  ].join("");
}

function scoreLines(s: ReturnType<typeof score>) {
  const days =
    s.days === undefined
      ? ""
      : ` · 日 ${s.days}/${s.daysTotal}（自信なし${s.unsureDays}）`;
  const mistakes = s.dayErrors
    .map(
      (error) =>
        `${error.day}日 ${error.expected}→${error.got}${error.unsure ? "(自信なし)" : ""}`
    )
    .join("、");
  return [
    `<p>${s.monthRight ? "" : "年月ちがい · "}名前 ${s.names}/${s.namesTotal}（自信なし${s.unsureNames}）${days}</p>`,
    s.missed.length > 0
      ? `<p>読めなかった: ${escape(s.missed.join("、"))}</p>`
      : "",
    s.extra.length > 0 ? `<p>違う名前: ${escape(s.extra.join("、"))}</p>` : "",
    s.dayErrors.length > 0 ? `<p>日の間違い: ${escape(mistakes)}</p>` : "",
  ];
}

function card(result: Result, imagePath: string) {
  const { call, cost, error, model, reading, score: s } = result;
  const wrong = new Set(s?.dayErrors.map((mistake) => mistake.day));
  const cents = cost === undefined ? "" : ` · 約$${cost.toFixed(4)}`;
  const lines =
    error === undefined
      ? [
          `<p>${(result.ms / 1000).toFixed(1)}秒 · 入力${call?.inputTokens} / 出力${call?.outputTokens}トークン${cents}</p>`,
          ...(s ? scoreLines(s) : []),
        ]
      : [`<p class="error">${escape(error)}</p>`];
  return `<article><h3>${escape(model.id)}</h3>
<div class="photo"><img src="${escape(imagePath)}" alt=""><svg viewBox="0 0 1000 1000" preserveAspectRatio="none">${reading ? shapesOf(reading, wrong) : ""}</svg></div>
${lines.join("\n")}</article>`;
}

function report(results: Result[], images: string[]) {
  const sections = images.map((image) => {
    const rows = results.filter((result) => result.image === image);
    return `<section><h2>${escape(image)}</h2><div class="grid">${rows
      .map((result) => card(result, `images/${imageName(image)}.jpg`))
      .join("")}</div></section>`;
  });
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><title>勤務表の読み取り比較</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;color:#222;background:#fafafa}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(520px,1fr));gap:16px}
article{background:#fff;border:1px solid #ddd;border-radius:10px;padding:12px}
article h3{margin:0 0 8px}article p{margin:6px 0;font-size:13px;line-height:1.5}
.photo{position:relative}.photo img{display:block;width:100%}
.photo svg{position:absolute;inset:0;width:100%;height:100%}
.error{color:#c00}.legend span{margin-right:14px;font-size:13px}
</style>
<h1>勤務表の読み取り比較</h1>
<p class="legend"><span style="color:#2f6fed">■ 名前</span><span style="color:#e0a800">■ 自信のない名前</span><span style="color:#f07c00">■ 対象の行</span><span style="color:#1a9e55">■ 日のマス</span><span style="color:#e5243b">■ 間違えた日</span><span>点線 = 自信なし</span></p>
${sections.join("\n")}</html>`;
}

function option(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value?.split(",");
}

const sameRun = (a: Result, b: Result) =>
  a.image === b.image && a.model.id === b.model.id;

// Runs add up: earlier results stay in the report unless this run did the
// same photo and model again, and a failure never replaces a success.
async function keepEarlier(fresh: Result[]) {
  const file = Bun.file(path.join(out, "results.json"));
  const stored: unknown = (await file.exists()) ? await file.json() : [];
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- written by this script.
  const earlier = stored as Result[];
  const kept = fresh.filter(
    (result) =>
      result.error === undefined ||
      !earlier.some((old) => sameRun(old, result) && old.error === undefined)
  );
  const order = (result: Result) =>
    models.findIndex((model) => model.id === result.model.id);
  return [
    ...earlier.filter((old) => !kept.some((result) => sameRun(old, result))),
    ...kept,
  ].toSorted((a, b) => a.image.localeCompare(b.image) || order(a) - order(b));
}

async function main() {
  const answersFile = Bun.file(path.join(photos, "answers.json"));
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- our own answer key, written by hand.
  const answers = (await answersFile.json()) as Record<string, Answer>;
  const onlyImages = option("images");
  const onlyModels = option("models");
  const onlyProviders = option("provider");
  // Scores the replies already in out/raw again, asking no model: for
  // after fixing answers.json.
  const rescore = process.argv.includes("--rescore");
  const files = new Set(await readdir(photos));
  const cases = Object.entries(answers)
    .filter(([name]) => !name.startsWith("_"))
    .map(([name, entry]) => {
      const file = entry.file ?? name;
      return { answer: { ...answers[file], ...entry }, file, name };
    })
    .filter(
      ({ file, name }) =>
        files.has(file) &&
        (onlyImages === undefined ||
          onlyImages.some((part) => name.includes(part)))
    );
  const images = cases.map(({ name }) => name);
  const chosen = models.filter(
    (model) =>
      (onlyModels === undefined ||
        onlyModels.some((part) => model.id.includes(part))) &&
      (onlyProviders === undefined || onlyProviders.includes(model.provider))
  );
  await mkdir(path.join(out, "images"), { recursive: true });
  await mkdir(path.join(out, "raw"), { recursive: true });

  const prepared = await Promise.all(
    cases.map(async ({ answer, file, name }) => ({
      answer,
      image: name,
      ...(await prepare(
        imageName(name),
        path.join(photos, file),
        answer.turn ?? 0
      )),
    }))
  );
  const pairs = prepared.flatMap((photo) =>
    chosen.map((model) => ({ ...photo, model }))
  );
  // Rescoring takes only the pairs that have a saved reply.
  const saved = await Promise.all(
    pairs.map(async (pair) => {
      const exists = await Bun.file(rawFile(pair.image, pair.model)).exists();
      return exists;
    })
  );
  const tasks = pairs
    .filter((_, index) => !rescore || saved[index] === true)
    .map(({ answer, base64, image, model }) => async () => {
      const result = await run(image, base64, answer, model, rescore);
      console.log(
        `${image} ${model.id}: ${result.error ?? `名前 ${result.score?.names}/${result.score?.namesTotal}${result.score?.days === undefined ? "" : ` 日 ${result.score.days}/${result.score.daysTotal}`} ${(result.ms / 1000).toFixed(0)}s`}`
      );
      return result;
    });
  console.log(
    `${tasks.length} ${rescore ? "saved replies" : "requests"} (${images.length} images x ${chosen.length} models)`
  );
  const fresh = await pool(tasks, CONCURRENCY);
  const results = await keepEarlier(fresh);
  await Bun.write(
    path.join(out, "results.json"),
    JSON.stringify(results, null, 2)
  );
  await Bun.write(
    path.join(out, "report.html"),
    report(results, [...new Set(results.map((result) => result.image))])
  );
  const total = fresh.reduce((sum, result) => sum + (result.cost ?? 0), 0);
  console.log(
    `\n約$${total.toFixed(2)} (一覧の料金から計算) → ${path.join(out, "report.html")}`
  );
}

await main();
// sharp's worker threads keep the process alive once the work is done.
process.exit(0);
