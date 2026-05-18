import { schema as s } from "jazz-tools";
import { app } from "@/schema";

export const permissions = s.definePermissions(
  app,
  ({ policy, anyOf, session }) => {
    type ShareGroupMemberWhere = Exclude<
      Parameters<typeof policy.shareGroupMembers.exists.where>[0],
      (...args: never[]) => unknown
    >;
    type ShareGroupMemberGroupId = NonNullable<
      ShareGroupMemberWhere["groupId"]
    >;

    const isShareGroupMember = (groupId: ShareGroupMemberGroupId) =>
      policy.shareGroupMembers.exists.where({
        groupId,
        user_id: session.user_id,
      });
    policy.shareGroups.allowRead.where((group) =>
      anyOf([{ $createdBy: session.user_id }, isShareGroupMember(group.id)])
    );
    policy.shareGroups.allowInsert.always();
    policy.shareGroups.allowUpdate
      .whereOld((group) =>
        anyOf([{ $createdBy: session.user_id }, isShareGroupMember(group.id)])
      )
      .whereNew((group) =>
        anyOf([{ $createdBy: session.user_id }, isShareGroupMember(group.id)])
      );
    policy.shareGroups.allowDelete.where((group) =>
      anyOf([{ $createdBy: session.user_id }, isShareGroupMember(group.id)])
    );

    policy.shareGroupMembers.allowRead.where((member) =>
      isShareGroupMember(member.groupId)
    );
    policy.shareGroupMembers.allowInsert.where((member) =>
      anyOf([{ user_id: session.user_id }, isShareGroupMember(member.groupId)])
    );
    policy.shareGroupMembers.allowUpdate
      .whereOld({ user_id: session.user_id })
      .whereNew({ user_id: session.user_id });
    policy.shareGroupMembers.allowDelete.where({ user_id: session.user_id });

    policy.patterns.allowRead.always();
    policy.patterns.allowInsert.always();
    policy.patterns.allowUpdate.where({ $createdBy: session.user_id });
    policy.patterns.allowDelete.where({ $createdBy: session.user_id });

    policy.shifts.allowRead.always();
    policy.shifts.allowInsert.always();
    policy.shifts.allowUpdate.where({ $createdBy: session.user_id });
    policy.shifts.allowDelete.where({ $createdBy: session.user_id });

    policy.shiftNotes.allowRead.where({ $createdBy: session.user_id });
    policy.shiftNotes.allowInsert.always();
    policy.shiftNotes.allowUpdate.where({ $createdBy: session.user_id });
    policy.shiftNotes.allowDelete.where({ $createdBy: session.user_id });

    policy.members.allowRead.always();
    policy.members.allowInsert.always();
    policy.members.allowUpdate.where({ $createdBy: session.user_id });
    policy.members.allowDelete.where({ $createdBy: session.user_id });
  }
);
