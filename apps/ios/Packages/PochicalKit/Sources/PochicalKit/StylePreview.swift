/// The style pages' preview (/design's stylePreviewOf): a made-up run of
/// the person's own patterns over `days`, the same whatever they have
/// entered, so a change of style shows in the same places every time.
/// Just shifts and days off: 早出, 残業 or a memo would mean nothing to most
/// people there.
public func stylePreviewDays(_ days: [Day], patterns: [Pattern]) -> [Day: DayEntry] {
  let sequence = sampleSequence(of: patterns)
  guard !sequence.isEmpty else { return [:] }
  var shown: [Day: DayEntry] = [:]
  for (index, day) in days.enumerated() {
    shown[day] = DayEntry(shift: sequence[index % sequence.count])
  }
  return shown
}

/// Each working pattern with what follows it, like 明け after 夜勤, and a
/// day off after every second one and after those followed.
func sampleSequence(of patterns: [Pattern]) -> [PatternID] {
  let ids = Set(patterns.map(\.id))
  let followers = Set(patterns.compactMap(\.nextDay))
  let off = patterns.first(where: \.countsAsOff)?.id
  let working = patterns.filter { !$0.countsAsOff && !followers.contains($0.id) }
  var sequence: [PatternID] = []
  for (index, pattern) in working.enumerated() {
    sequence.append(pattern.id)
    if let next = pattern.nextDay, ids.contains(next) {
      sequence.append(next)
    }
    if let off, index % 2 == 1 || pattern.nextDay != nil {
      sequence.append(off)
    }
  }
  if let off, sequence.last != off {
    sequence.append(off)
  }
  return sequence
}

/// The marks the テーマ and シフトの色 choices show side by side
/// (/design's useOwnSamples().week): the preview's run, each pattern once,
/// the first four.
public func styleSamples(of patterns: [Pattern]) -> [PatternID] {
  var seen = Set<PatternID>()
  return Array(sampleSequence(of: patterns).filter { seen.insert($0).inserted }.prefix(4))
}
