import { changeOn, patternOn } from "./design-group-data";
import type { GroupSummary, Member } from "./design-group-data";
import { sampleOthers } from "./design-group-samples";
import type { WidgetCompanion, WidgetPerson } from "./design-widgets";

// Someone in the person's groups as the widgets see them: their face, the
// shape they draw their marks in, and each day's pattern and hours.
export function widgetPersonOf(member: Member): WidgetPerson {
  return {
    dayOn: (date) => {
      const pattern = patternOn(member, date);
      if (!pattern) {
        return undefined;
      }
      const change = changeOn(member, date);
      return {
        early: change?.early ?? false,
        late: change?.late ?? false,
        look: pattern.look,
        name: pattern.name,
        off: pattern.off,
        time: change?.time ?? pattern.time,
      };
    },
    name: member.name,
    photo: member.photo,
    style: member.style,
  };
}

// A whole group picked for 次の休み (みんな休み): its name and mark, and
// everyone in it but the person.
export function groupCompanion(group: GroupSummary): WidgetCompanion {
  return {
    kind: "group",
    mark: group.mark,
    name: group.name,
    people: sampleOthers(group.id).map(widgetPersonOf),
  };
}
