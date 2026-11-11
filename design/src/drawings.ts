// The drawings a person can use as their face in place of a photo
// (spec/sync-protocol.md, Profile), in the order the chooser shows them,
// each with its name as a screen reader says it. The pictures are
// drawings/{id}.svg, squares of 640 (chatRules.pictureMaxEdge) drawn to
// show in a face's circle; `mise run gen` writes them out for the native
// apps and the prototype.
export const drawings = [
  { id: "cat", name: "ねこ" },
  { id: "dog", name: "いぬ" },
  { id: "rabbit", name: "うさぎ" },
  { id: "bear", name: "くま" },
  { id: "penguin", name: "ペンギン" },
  { id: "chick", name: "ひよこ" },
  { id: "coffee", name: "コーヒー" },
  { id: "onigiri", name: "おにぎり" },
  { id: "strawberry", name: "いちご" },
  { id: "flower", name: "花" },
  { id: "cactus", name: "サボテン" },
  { id: "moon", name: "月" },
] as const;
