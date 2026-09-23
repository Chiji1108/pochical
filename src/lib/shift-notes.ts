import { createShiftNoteDrafts } from "@/lib/shift-note-drafts";
import { patchShift } from "@/lib/work-changes";
import { writeWork } from "@/lib/work-data";

export const shiftNoteDrafts = createShiftNoteDrafts(async (shiftId, notes) => {
  await writeWork(patchShift(shiftId, { notes }));
});
