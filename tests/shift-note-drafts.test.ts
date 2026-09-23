import { expect, test } from "bun:test";
import { createShiftNoteDrafts } from "../src/lib/shift-note-drafts";

test("switching days flushes the draft to its original shift", () => {
  const writes: [string, string][] = [];
  const drafts = createShiftNoteDrafts((id, notes) => {
    writes.push([id, notes]);
    return Promise.resolve();
  });
  drafts.schedule("first", "edited notes");
  drafts.flush("first");
  drafts.schedule("second", "other notes");
  drafts.flush("second");
  expect(writes).toEqual([
    ["first", "edited notes"],
    ["second", "other notes"],
  ]);
});

test("only the latest edit is saved and deleting cancels a pending save", () => {
  const writes: string[] = [];
  const drafts = createShiftNoteDrafts((_id, notes) => {
    writes.push(notes);
    return Promise.resolve();
  });
  drafts.schedule("first", "old");
  drafts.schedule("first", "latest");
  drafts.flush("first");
  drafts.schedule("deleted", "must not recreate shift");
  drafts.discard("deleted");
  drafts.flush("deleted");
  expect(writes).toEqual(["latest"]);
});
