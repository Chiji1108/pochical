import PochicalDesign

// Which lines of a chat are pinned (spec/chat.md, Pins;
// spec/vectors/chat.json, pins), as the group keeps them, for showing the
// member's own pins at once while they are on their way.

/// The pins, the latest first, after pinning `id`, and the one that made
/// room for it: a pinned line only moves up; one past `most` takes the
/// place of the oldest.
public func pinStep(_ pins: [String], pin id: String, most: Int = Chat.maxPins)
  -> (pins: [String], dropped: String?)
{
  let next = [id] + pins.filter { $0 != id }
  return (Array(next.prefix(most)), next.count > most ? next.last : nil)
}

/// The pins after taking `id`'s pin off.
public func pinStep(_ pins: [String], unpin id: String) -> (pins: [String], dropped: String?) {
  (pins.filter { $0 != id }, nil)
}

/// The pins after `id` is taken back, its pin going with it.
public func pinStep(_ pins: [String], unsend id: String) -> (pins: [String], dropped: String?) {
  pinStep(pins, unpin: id)
}
