import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval(
  "resume interrupted account deletions",
  { minutes: 5 },
  internal.accountDeletion.resumeStalled,
  {}
);
export default crons;
