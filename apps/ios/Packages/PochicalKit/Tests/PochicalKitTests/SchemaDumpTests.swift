import Foundation
import GRDB
import SQLiteData
import Testing

@testable import PochicalKit

private func normalized(_ sql: String) -> String {
  var text = sql.split(whereSeparator: \.isWhitespace).joined(separator: " ")
  for mark in ["(", ")", ","] {
    text = text.replacingOccurrences(of: " \(mark)", with: mark)
    text = text.replacingOccurrences(of: "\(mark) ", with: mark)
  }
  return text
}

/// A CREATE TABLE's items split at top-level commas: its column definitions
/// in order, its table constraints as a set, and what follows the list.
private func tableParts(_ sql: String) -> [String: [String]] {
  let chars = Array(sql)
  guard let open = chars.firstIndex(of: "(") else { return ["raw": [sql]] }
  var depth = 0
  var quote: Character?
  var items: [String] = []
  var current = ""
  var close = chars.count
  var index = open + 1
  while index < chars.count {
    let char = chars[index]
    if let q = quote {
      current.append(char)
      if char == q { quote = nil }
    } else if char == "\"" || char == "'" {
      quote = char
      current.append(char)
    } else if char == "(" {
      depth += 1
      current.append(char)
    } else if char == ")" {
      if depth == 0 {
        close = index
        break
      }
      depth -= 1
      current.append(char)
    } else if char == "," && depth == 0 {
      items.append(current)
      current = ""
    } else {
      current.append(char)
    }
    index += 1
  }
  items.append(current)
  let parts = items.map(normalized)
  let constraintWords = ["PRIMARY KEY", "UNIQUE", "CHECK", "FOREIGN KEY", "CONSTRAINT"]
  let isConstraint = { (item: String) in constraintWords.contains { item.hasPrefix($0) } }
  return [
    "head": [normalized(String(chars[..<open]))],
    "columns": parts.filter { !isConstraint($0) },
    "constraints": parts.filter(isConstraint).sorted(),
    "tail": [normalized(String(chars[(close + 1)...]))],
  ]
}

@Test func dumpSchema() throws {
  guard let out = ProcessInfo.processInfo.environment["SCHEMA_DUMP"] else { return }
  let url = URL(fileURLWithPath: NSTemporaryDirectory()).appending(path: UUID().uuidString)
  let database = try DatabasePool(path: url.path())
  try migrator.migrate(database)
  let dump = try database.read { db -> [[String: String]] in
    let rows = try Row.fetchAll(
      db,
      sql: """
        SELECT type, name, tbl_name, sql FROM sqlite_master
        WHERE name != 'grdb_migrations' ORDER BY type, name
        """)
    return try rows.map { row in
      let type: String = row["type"]
      let name: String = row["name"]
      let sql: String? = row["sql"]
      var entry: [String: String] = ["type": type, "name": name, "tbl_name": row["tbl_name"]]
      if type == "table", let sql {
        for (key, value) in tableParts(sql) { entry[key] = value.joined(separator: " | ") }
        for pragma in ["table_xinfo", "index_list", "foreign_key_list"] {
          entry[pragma] = try Row.fetchAll(db, sql: "PRAGMA \(pragma)(\"\(name)\")")
            .map(\.description).joined(separator: " | ")
        }
        entry["table_list"] = try Row.fetchAll(
          db, sql: "SELECT type, ncol, wr, strict FROM pragma_table_list WHERE name = ?",
          arguments: [name]
        ).map(\.description).joined()
      } else {
        entry["sql"] = sql.map(normalized) ?? "NULL"
      }
      return entry
    }
  }
  let data = try JSONSerialization.data(
    withJSONObject: dump, options: [.prettyPrinted, .sortedKeys])
  try data.write(to: URL(fileURLWithPath: out))

  let clock = ContinuousClock()
  var timings: [Duration] = []
  for _ in 0..<20 {
    timings.append(try clock.measure { _ = try database.read(migrator.hasSchemaChanges) })
  }
  print("SCHEMA_DUMP hasSchemaChanges:", timings.sorted()[timings.count / 2], "median of 20")
  try? FileManager.default.removeItem(at: url)
}
