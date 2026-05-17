import { schema as s } from "jazz-tools";
import { app } from "@/schema";

export const permissions = s.definePermissions(
  app,
  ({ policy, allOf, anyOf, session }) => {
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
    policy.todos.allowRead.where({ $createdBy: session.user_id });
    policy.todos.allowInsert.always();
    policy.todos.allowUpdate.where({ $createdBy: session.user_id });
    policy.todos.allowDelete.where({ $createdBy: session.user_id });

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

    policy.shareGroupAccess.allowRead.where((access) =>
      anyOf([
        { ownerUserId: session.user_id },
        { viewerUserId: session.user_id },
        isShareGroupMember(access.groupId),
      ])
    );
    policy.shareGroupAccess.allowInsert.where((access) =>
      isShareGroupMember(access.groupId)
    );
    policy.shareGroupAccess.allowUpdate.never();
    policy.shareGroupAccess.allowDelete.where((access) =>
      allOf([
        isShareGroupMember(access.groupId),
        anyOf([
          { ownerUserId: session.user_id },
          { viewerUserId: session.user_id },
        ]),
      ])
    );

    policy.patterns.allowRead.where((pattern) =>
      anyOf([
        { ownerUserId: session.user_id },
        policy.shareGroupAccess.exists.where({
          ownerUserId: pattern.ownerUserId,
          viewerUserId: session.user_id,
        }),
      ])
    );
    policy.patterns.allowInsert.where({ ownerUserId: session.user_id });
    policy.patterns.allowUpdate.where({ ownerUserId: session.user_id });
    policy.patterns.allowDelete.where({ ownerUserId: session.user_id });

    policy.shifts.allowRead.where((shift) =>
      anyOf([
        { ownerUserId: session.user_id },
        policy.shareGroupAccess.exists.where({
          ownerUserId: shift.ownerUserId,
          viewerUserId: session.user_id,
        }),
      ])
    );
    policy.shifts.allowInsert.where({ ownerUserId: session.user_id });
    policy.shifts.allowUpdate.where({ ownerUserId: session.user_id });
    policy.shifts.allowDelete.where({ ownerUserId: session.user_id });

    policy.shiftNotes.allowRead.where({ ownerUserId: session.user_id });
    policy.shiftNotes.allowInsert.where({ ownerUserId: session.user_id });
    policy.shiftNotes.allowUpdate.where({ ownerUserId: session.user_id });
    policy.shiftNotes.allowDelete.where({ ownerUserId: session.user_id });

    policy.members.allowRead.where({ ownerUserId: session.user_id });
    policy.members.allowInsert.where({ ownerUserId: session.user_id });
    policy.members.allowUpdate.where({ ownerUserId: session.user_id });
    policy.members.allowDelete.where({ ownerUserId: session.user_id });
  }
);
