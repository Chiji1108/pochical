import PochicalDesign

// Which lines of a chat are pinned (spec/chat.md, Pins;
// spec/vectors/chat.json, pins), by seq, as the group keeps them, for
// showing the member's own pins at once while they are on their way.

/// The pins, the latest first, after pinning `seq`, and the one that made
/// room for it: a pinned line only moves up; one past `most` takes the
/// place of the oldest.
public func pinStep(_ pins: [Int64], pin seq: Int64, most: Int = Chat.maxPins)
  -> (pins: [Int64], dropped: Int64?)
{
  let next = [seq] + pins.filter { $0 != seq }
  return (Array(next.prefix(most)), next.count > most ? next.last : nil)
}

/// The pins after taking `seq`'s pin off.
public func pinStep(_ pins: [Int64], unpin seq: Int64) -> (pins: [Int64], dropped: Int64?) {
  (pins.filter { $0 != seq }, nil)
}

/// The pins after `seq` is taken back, its pin going with it.
public func pinStep(_ pins: [Int64], unsend seq: Int64) -> (pins: [Int64], dropped: Int64?) {
  pinStep(pins, unpin: seq)
}
