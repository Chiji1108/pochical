import Testing
import UIKit

@testable import Pochical

/// The composer with a hardware keyboard (spec/chat.md, A keyboard and a
/// mouse): Return sends and Shift+Return starts a new line, both named for
/// the list holding ⌘ shows, and a word being converted takes its Return.
@MainActor struct ComposerKeysTests {
  private let field = ComposerTextView()

  private func command(_ flags: UIKeyModifierFlags) throws -> UIKeyCommand {
    try #require(field.keyCommands?.first { $0.input == "\r" && $0.modifierFlags == flags })
  }

  private func perform(_ command: UIKeyCommand) throws {
    let action = try #require(command.action)
    #expect(UIApplication.shared.sendAction(action, to: field, from: nil, for: nil))
  }

  @Test func returnSends() throws {
    var sent = 0
    field.onSend = { sent += 1 }
    field.text = "おはよう"
    let send = try command([])
    #expect(send.title == "送信")
    #expect(send.wantsPriorityOverSystemBehavior)
    #expect(field.canPerformAction(try #require(send.action), withSender: send))
    try perform(send)
    #expect(sent == 1)
    #expect(field.text == "おはよう")
  }

  @Test func returnWithNothingToSendDoesNothing() throws {
    field.text = ""
    try perform(try command([]))
    #expect(field.text == "")
  }

  @Test func shiftReturnStartsANewLine() throws {
    var sent = 0
    field.onSend = { sent += 1 }
    field.text = "一行目"
    let newLine = try command(.shift)
    #expect(newLine.title == "改行")
    #expect(newLine.wantsPriorityOverSystemBehavior)
    try perform(newLine)
    #expect(field.text == "一行目\n")
    #expect(sent == 0)
  }

  @Test func aWordBeingConvertedTakesItsReturn() throws {
    field.setMarkedText("か", selectedRange: NSRange(location: 1, length: 0))
    #expect(field.markedTextRange != nil)
    for flags: UIKeyModifierFlags in [[], .shift] {
      let command = try command(flags)
      #expect(!field.canPerformAction(try #require(command.action), withSender: command))
    }
  }
}
