import { useState } from "react";

import { initialDesignSchedule } from "./design-days";
import { sampleGroups } from "./design-group-samples";
import { createUserStore, sampleCoworkers } from "./design-user-store";

// The demo's sample person, with their coworkers, groups and days, made
// once for the screen that shows them: the top page's phones, /try and
// the share image. A module of its own, so a route takes it without
// pulling in the top page's screens.
export function useSamplePerson() {
  const [person] = useState(() =>
    createUserStore({
      coworkers: sampleCoworkers,
      groups: sampleGroups(),
      schedule: initialDesignSchedule(),
    })
  );
  return person;
}
