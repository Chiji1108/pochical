type PendingNote = { notes: string; timer: ReturnType<typeof setTimeout> };
type NoteWriter = (shiftId: string, notes: string) => Promise<unknown>;

export const createShiftNoteDrafts = (write: NoteWriter, delay = 450) => {
  const pending = new Map<string, PendingNote>();

  const flush = (shiftId: string) => {
    const draft = pending.get(shiftId);
    if (!draft) {
      return;
    }
    clearTimeout(draft.timer);
    pending.delete(shiftId);
    write(shiftId, draft.notes).catch(() => undefined);
  };

  const discard = (shiftId: string) => {
    const draft = pending.get(shiftId);
    if (draft) {
      clearTimeout(draft.timer);
      pending.delete(shiftId);
    }
  };

  return {
    discard,
    flush,
    schedule(shiftId: string, notes: string) {
      discard(shiftId);
      pending.set(shiftId, {
        notes,
        timer: setTimeout(() => flush(shiftId), delay),
      });
    },
  };
};
