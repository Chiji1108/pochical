import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

// 設定 › 一緒に働く人 (/design's CoworkersPage and CoworkerEditor): the
// people noted on days, like who is on the same shift. Only names, not
// app users; days name them by id, so a new name shows on every day they
// are on.

/// Said when adding past `coworkersMax`.
let coworkersFull = "一緒に働く人は\(coworkersMax)人までです"

/// The milliseconds now, for an edit's clock.
private func nowMs() -> Int64 {
  Int64(Date.now.timeIntervalSince1970 * 1000)
}

/// 設定 › 一緒に働く人.
struct CoworkersPage: View {
  @Environment(\.themeColors) private var colors
  @Dependency(\.defaultDatabase) private var database
  @FetchAll private var rows: [CoworkerRow]
  @FetchAll private var order: [CoworkerOrderRow]
  /// The days that note anyone, to count each person's.
  @FetchAll(DayRow.where { $0.people.isNot(nil) }) private var days: [DayRow]
  @State private var editMode = EditMode.inactive
  @State private var adding = false
  @State private var newName = ""
  @State private var full = false

  var body: some View {
    let list = ordered(rows, by: order)
    let sorting = editMode.isEditing
    List {
      if !list.isEmpty {
        Section {
          ForEach(list) { person in
            if sorting {
              Text(person.name).lineLimit(1)
            } else {
              NavigationLink {
                CoworkerEditor(
                  person: person, days: daysWith(person.id),
                  taken: list.map(\.name).filter { $0 != person.name })
              } label: {
                LabeledContent {
                  Text("\(daysWith(person.id))日")
                } label: {
                  Text(person.name).lineLimit(1)
                }
              }
            }
          }
          .onMove { from, to in
            var ids = list.map(\.id)
            ids.move(fromOffsets: from, toOffset: to)
            try? database.write { try OwnValues.orderCoworkers(ids, now: nowMs(), in: $0) }
          }
        }
        .settingsRows()
      }
      Section {
        if !sorting {
          Button {
            if list.count >= coworkersMax {
              full = true
            } else {
              adding = true
            }
          } label: {
            Label("人を追加", systemImage: "plus")
              .foregroundStyle(colors.accentDefault)
          }
          .settingsRows()
        }
      } footer: {
        Text(
          sorting
            ? "つまみを上下に動かして並べ替えます。日付の詳細でも、この順に並びます。"
            : "同じシフトに入る人などを、日付の詳細でその日にメモできます。ここで直した名前は、入れてある日にも反映されます。")
      }
    }
    .settingsList()
    .environment(\.editMode, $editMode)
    .navigationTitle("一緒に働く人")
    .toolbar {
      if list.count > 1 {
        ToolbarItem(placement: .primaryAction) {
          Button(sorting ? "完了" : "並び替え") {
            withAnimation { editMode = sorting ? .inactive : .active }
          }
        }
      }
    }
    .alert("人を追加", isPresented: $adding) {
      TextField("名前", text: $newName)
      Button("追加") { add(to: list) }
      Button("キャンセル", role: .cancel) { newName = "" }
    }
    .alert(coworkersFull, isPresented: $full) {
      Button("OK", role: .cancel) {}
    }
  }

  /// How many days note someone.
  private func daysWith(_ id: String) -> Int {
    days.count { ($0.people ?? "").split(separator: " ").contains { $0 == id } }
  }

  /// Adds the name typed, cut to the limit; one already there, or none,
  /// adds no one.
  private func add(to list: [Coworker]) {
    let name = String(
      newName.trimmingCharacters(in: .whitespacesAndNewlines).prefix(TextLimits.personName))
    newName = ""
    guard !name.isEmpty, !list.contains(where: { $0.name == name }) else { return }
    // Counted again: the list may have grown while the name was typed.
    guard list.count < coworkersMax else {
      full = true
      return
    }
    _ = try? database.write { try OwnValues.addCoworker(named: name, now: nowMs(), in: $0) }
  }
}

/// Someone's name, changed on every day they are on; deleting takes them
/// off those days, asked first.
private struct CoworkerEditor: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Dependency(\.defaultDatabase) private var database
  let person: Coworker
  let days: Int
  /// The others' names: one of them cannot be taken.
  let taken: [String]
  @State private var draft: String
  @State private var confirming = false

  init(person: Coworker, days: Int, taken: [String]) {
    self.person = person
    self.days = days
    self.taken = taken
    _draft = State(initialValue: person.name)
  }

  var body: some View {
    let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    let duplicate = taken.contains(trimmed)
    Form {
      Section {
        LabeledContent("名前") {
          LimitedTextField(placeholder: "", text: $draft, limit: TextLimits.personName)
            .multilineTextAlignment(.trailing)
        }
      } footer: {
        Text(
          duplicate
            ? "同じ名前の人がもういます。"
            : "\(days)日の予定に入っています。名前を変えると、その日の表示も変わります。")
      }
      .settingsRows()

      Section {
        Button("この人を削除", role: .destructive) { confirming = true }
          .frame(maxWidth: .infinity)
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle(person.name)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button("保存", role: .confirm) {
          try? database.write {
            try OwnValues.renameCoworker(person.id, to: trimmed, now: nowMs(), in: $0)
          }
          dismiss()
        }
        .disabled(trimmed.isEmpty || duplicate || trimmed == person.name)
      }
    }
    .alert("\(person.name)を削除しますか？", isPresented: $confirming) {
      Button("キャンセル", role: .cancel) {}
      Button("削除", role: .destructive) {
        try? database.write { try OwnValues.deleteCoworker(person.id, now: nowMs(), in: $0) }
        dismiss()
      }
    } message: {
      Text("\(days)日の予定から\(person.name)が外れます。")
    }
  }
}
