import { db } from "@/lib/instant";
import { createShiftNoteDrafts } from "@/lib/shift-note-drafts";

export const shiftNoteDrafts = createShiftNoteDrafts(async (shiftId, notes) => {
  await db.transact(db.tx.shifts[shiftId].update({ notes }));
});
