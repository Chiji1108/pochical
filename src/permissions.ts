import { schema as s } from "jazz-tools";
import { app } from "@/schema";

export const permissions = s.definePermissions(app, ({ policy, session }) => {
  policy.patterns.allowRead.always();
  policy.patterns.allowInsert.always();
  policy.patterns.allowUpdate.where({ $createdBy: session.user_id });
  policy.patterns.allowDelete.where({ $createdBy: session.user_id });

  policy.shifts.allowRead.always();
  policy.shifts.allowInsert.always();
  policy.shifts.allowUpdate.where({ $createdBy: session.user_id });
  policy.shifts.allowDelete.where({ $createdBy: session.user_id });

  policy.dayNotes.allowRead.where({ $createdBy: session.user_id });
  policy.dayNotes.allowInsert.always();
  policy.dayNotes.allowUpdate.where({ $createdBy: session.user_id });
  policy.dayNotes.allowDelete.where({ $createdBy: session.user_id });

  policy.members.allowRead.always();
  policy.members.allowInsert.always();
  policy.members.allowUpdate.where({ $createdBy: session.user_id });
  policy.members.allowDelete.where({ $createdBy: session.user_id });
});
