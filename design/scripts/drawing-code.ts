// The faces' drawings (src/drawings.ts) for the native apps and the
// prototype. Each gets the SVG as it is drawn, to draw with what it
// already has: iOS in an asset catalog, which Xcode compiles as vector
// art, Android as a raw resource Coil's SVG decoder reads, and the
// prototype as an image's data URL.
import { readFileSync } from "node:fs";
import path from "node:path";

import { drawings } from "../src/drawings";

const DOC =
  "The drawings a person can use as their face in place of a photo, in the chooser's order (design/src/drawings.ts).";

const pictures = drawings.map(({ id, name }) => ({
  id,
  name,
  svg: readFileSync(
    path.join(import.meta.dirname, `../src/drawings/${id}.svg`),
    "utf-8"
  ),
}));

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const catalogInfo = { author: "xcode", version: 1 };

// The asset catalog's files under `directory`: one image set a drawing.
export const swiftDrawingAssets = (directory: string, header: string) =>
  Object.fromEntries<string>([
    [`${directory}/Contents.json`, json({ info: catalogInfo })],
    ...pictures.flatMap(({ id, svg }): [string, string][] => [
      [
        `${directory}/${id}.imageset/Contents.json`,
        json({
          images: [{ filename: `${id}.svg`, idiom: "universal" }],
          info: catalogInfo,
          properties: { "preserves-vector-representation": true },
        }),
      ],
      [`${directory}/${id}.imageset/${id}.svg`, `<!-- ${header} -->\n${svg}`],
    ]),
  ]);

export const swiftDrawings = () => [
  "import SwiftUI",
  "",
  `/// ${DOC}`,
  "public struct FaceDrawing: Sendable, Identifiable, Hashable {",
  "  public let id: String",
  "  /// Its name, as a screen reader says it.",
  "  public let name: String",
  "",
  "  /// The picture, a square that scales to any size.",
  "  public var image: Image { Image(id, bundle: .module) }",
  "",
  "  public static let all: [FaceDrawing] = [",
  ...pictures.map(
    ({ id, name }) =>
      `    FaceDrawing(id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}),`
  ),
  "  ]",
  "}",
];

// The raw resources under `directory`: one SVG a drawing.
export const kotlinDrawingResources = (directory: string, header: string) =>
  Object.fromEntries(
    pictures.map(({ id, svg }) => [
      `${directory}/drawing_${id}.svg`,
      `<!-- ${header} -->\n${svg}`,
    ])
  );

export const kotlinDrawings = () => [
  `/** ${DOC} */`,
  "data class FaceDrawing(",
  "  val id: String,",
  "  /** Its name, as a screen reader says it. */",
  "  val name: String,",
  "  /** The picture, an SVG among the raw resources: a square that scales to any size. */",
  "  val picture: Int,",
  ") {",
  "  companion object {",
  "    val all: List<FaceDrawing> = listOf(",
  ...pictures.map(
    ({ id, name }) =>
      `      FaceDrawing(${JSON.stringify(id)}, ${JSON.stringify(name)}, R.raw.drawing_${id}),`
  ),
  "    )",
  "  }",
  "}",
];

export const webDrawings = (header: string) =>
  [
    `// ${header}`,
    `// ${DOC}`,
    `export const drawings = ${JSON.stringify(
      pictures.map(({ id, name, svg }) => ({
        id,
        name,
        src: `data:image/svg+xml,${encodeURIComponent(svg)}`,
      })),
      null,
      2
    )} as const;`,
    "",
  ].join("\n");
