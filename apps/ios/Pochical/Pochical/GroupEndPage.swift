import PochicalKit
import SQLiteData
import SwiftUI

/// When a group ends as the device holds it, in ms since the epoch, 0 for
/// none, read again as the group says another (spec/sync-protocol.md, A
/// group's end).
struct GroupEndRequest: FetchKeyRequest, Hashable {
  let groupID: String

  func fetch(_ db: Database) throws -> Int64 {
    try GroupSync.endsAtMs(of: groupID, in: db)
  }
}

/// What passing a group's end does, as グループの設定 says it under a group
/// that has one, and 終了日 before one is given.
let groupEndNote = "終了日を過ぎると、このグループはメンバー全員から消えます。"

/// The row 終了日 of グループの設定 and グループを作る: the group's end date,
/// なし without one, opening the page that changes it. `save` keeps the day
/// picked, or none: the group's settings send it, and a group not made yet
/// keeps it to be made with.
struct GroupEndLink: View {
  let end: Day?
  let save: (Day?) async throws -> Void

  var body: some View {
    PageLink {
      GroupEndPage(current: end, save: save)
    } label: {
      LabeledContent("終了日") {
        Text(end.map { GroupEnd.words($0, today: .today) } ?? "なし")
      }
    }
  }
}

/// 終了日: whether the group has an end, and its day, from today on, as
/// today's end is always still to come; kept as a draft until 保存, as
/// グループを編集 keeps a name. An end someone else sets meanwhile leaves
/// the draft as it is, and 保存 then sends it over theirs.
private struct GroupEndPage: View {
  @Environment(\.dismiss) private var dismiss
  /// The group's end date as it is now, none for a group with no end.
  let current: Day?
  let save: (Day?) async throws -> Void
  @State private var on: Bool
  @State private var day: Day
  @State private var saving = false
  @State private var failed = false

  init(current: Day?, save: @escaping (Day?) async throws -> Void) {
    self.current = current
    self.save = save
    _on = State(initialValue: current != nil)
    // A new end starts a month from today, about as far off as what a
    // group with an end is made for.
    let calendar = Calendar.current
    let today = Day.today
    let monthOn = calendar.date(byAdding: .month, value: 1, to: today.date(in: calendar))
    _day = State(initialValue: max(current ?? monthOn.map { Day($0, in: calendar) } ?? today, today))
  }

  var body: some View {
    let calendar = Calendar.current
    let picked = on ? day : nil
    List {
      Section {
        Toggle("終了日をつける", isOn: $on.animation())
        if on {
          DatePicker(
            "終了日",
            selection: Binding { day.date(in: calendar) } set: { day = Day($0, in: calendar) },
            in: Day.today.date(in: calendar)..., displayedComponents: .date
          )
          .datePickerStyle(.graphical)
        }
      } footer: {
        Text("\(groupEndNote)チャット、写真、シフトの共有も消え、元に戻せません。終了日は、メンバーならだれでも変更できます。")
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("終了日")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        if saving {
          ProgressView()
        } else {
          Button("保存", role: .confirm) { keep(picked) }
            .disabled(picked == current)
        }
      }
    }
    .alert("終了日を変更できませんでした", isPresented: $failed) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("通信できる場所で、もう一度お試しください。")
    }
  }

  private func keep(_ picked: Day?) {
    saving = true
    Task {
      defer { saving = false }
      do {
        try await save(picked)
        dismiss()
      } catch {
        ReviewPrompt.troubled = true
        failed = true
      }
    }
  }
}

/// The end date this device shows for a group ending at `endsAtMs`
/// (`GroupEnd.endDay`); none for 0, a group with no end.
func groupEndDay(_ endsAtMs: Int64) -> Day? {
  endsAtMs == 0 ? nil : GroupEnd.endDay(endsAtMs, in: .current)
}

/// The moment the end date `end` ends on this device, as a group keeps its
/// end (`GroupEnd.endsAt`); 0 for no end.
func groupEndsAt(_ end: Day?) -> Int64 {
  end.map { GroupEnd.endsAt($0, in: .current) } ?? 0
}
