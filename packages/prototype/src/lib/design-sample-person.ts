import { useState } from "react";

import { initialDesignSchedule } from "./design-days";
import { sampleGroups } from "./design-group-samples";
import { createUserStore, sampleCoworkers } from "./design-user-store";
import type { OwnData } from "./design-user-store";

// The demo's sample person, with their coworkers, groups and days, made
// once for the screen that shows them: the top page's phones, /try and
// the share image. A module of its own, so a route takes it without
// pulling in the top page's screens. A screen may give them more of
// their own, such as an order.
export function useSamplePerson(own: Partial<OwnData> = {}) {
  const [person] = useState(() =>
    createUserStore({
      coworkers: sampleCoworkers,
      groups: sampleGroups(),
      schedule: initialDesignSchedule(),
      ...own,
    })
  );
  return person;
}
