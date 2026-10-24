package app.pochical.kit

import app.pochical.design.Chat
import app.pochical.v1.ChatEdit
import app.pochical.v1.block
import app.pochical.v1.change
import app.pochical.v1.chatContent
import app.pochical.v1.chatPoll
import app.pochical.v1.copy
import app.pochical.v1.linkPreview
import app.pochical.v1.chatMute
import app.pochical.v1.chatSend
import app.pochical.v1.chatSendContent
import app.pochical.v1.chatSendWords
import app.pochical.v1.chatNotifications
import app.pochical.v1.membership
import app.pochical.v1.unreadCount
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The group the tests' chats are in, listed for the user as their socket would list it. */
private suspend fun AppDatabase.listGroup(groupId: String = "g1") =
  write { take(listOf(change { membership = membership { this.groupId = groupId; name = "家族" } })) }

/** The chat on [device] as [me] opens it, from [from], once [until] holds. */
private suspend fun Device.chat(me: String, from: Long? = null, until: (ChatState) -> Boolean = { true }): ChatState =
  withTimeout(10_000) { Chats(database).state("g1", GROUP_THREAD, me, from).first(until) }

/** The chat's lines and the member's edits as sync takes them in and the group's socket sends them. */
@RunWith(RobolectricTestRunner::class)
class ChatSyncTest {
  private val server = FakeServer()
  private val devices = mutableListOf<Device>()

  private fun device() = Device(server).also { devices += it }

  @After
  fun closeAll() {
    devices.forEach { it.close() }
    server.close()
  }

  private suspend fun signedIn(): Device {
    val phone = device()
    phone.database.listGroup()
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    return phone
  }

  @Test
  fun aLineSentShowsWaitingAtOnceThenAsTheGroups() = runBlocking {
    val phone = signedIn()
    val me = server.userId
    Chats(phone.database).send("g1", GROUP_THREAD, "おはよう")
    val waiting = phone.chat(me).waiting.single()
    assertEquals(LineContent.Words("おはよう"), waiting.content)
    assertFalse(waiting.failed)

    // No page holds the group open: its socket opens for the outbox alone, and closes once it is sent.
    val sent = phone.chat(me) { it.waiting.isEmpty() && it.lines.isNotEmpty() }
    assertEquals(listOf(1L to "おはよう"), sent.lines.map { it.seq to (it.content as LineContent.Words).text })
    assertEquals(waiting.opId, sent.lines.single().opId)
    assertEquals(1, server.lines("g1").size)
  }

  @Test
  fun aLineSentJustBeforeLeavingGoesInTheBackground() = runBlocking {
    val phone = signedIn()
    val hold = phone.account.hold("g1")
    Chats(phone.database).send("g1", GROUP_THREAD, "またね")
    hold.release()
    phone.account.background()
    eventually { server.lines("g1").size == 1 }
    assertEquals(1, phone.backgroundSends.get())
  }

  @Test
  fun aSendTheGroupRefusesIsNotSentUntilSentAgain() = runBlocking {
    val phone = signedIn()
    val me = server.userId
    server.refuseSends = true
    val chats = Chats(phone.database)
    chats.send("g1", GROUP_THREAD, "届かない")
    val failed = phone.chat(me) { it.waiting.singleOrNull()?.failed == true }.waiting.single()
    assertTrue(server.lines("g1").isEmpty())

    server.refuseSends = false
    chats.sendAgain(failed.opId)
    val sent = phone.chat(me) { it.waiting.isEmpty() && it.lines.isNotEmpty() }
    assertEquals(failed.opId, sent.lines.single().opId)
  }

  @Test
  fun aChatOpensOnItsLatestPageAndAsksForEarlierOnes() = runBlocking {
    server.write("g1", "u2", (1..120).map { "$it" })
    val phone = signedIn()
    val me = server.userId
    phone.account.hold("g1")
    // The catch-up brings each chat's latest page alone.
    val opened = phone.chat(me) { it.lines.size == Chat.pageSize }
    assertEquals(71L, opened.lines.first().seq)
    assertEquals(71L, opened.heldFrom)
    assertFalse(opened.atStart)

    val socket = withTimeout(10_000) { phone.account.chatSocket("g1").first { it != null }!! }
    eventually { socket.requestPage(GROUP_THREAD, beforeSeq = 71) }
    val earlier = phone.chat(me, from = 21) { it.lines.first().seq == 21L }
    assertEquals(120L, earlier.lines.last().seq)
    assertEquals(21L, earlier.heldFrom)
  }

  @Test
  fun aPageOnItsWayAsTheUserLeavesBringsNothingBack() = runBlocking {
    server.write("g1", "u2", (1..120).map { "$it" })
    val phone = signedIn()
    val me = server.userId
    phone.account.hold("g1")
    phone.chat(me) { it.lines.size == Chat.pageSize }
    val socket = withTimeout(10_000) { phone.account.chatSocket("g1").first { it != null }!! }
    server.pageDelayMs = 500
    eventually { socket.requestPage(GROUP_THREAD, beforeSeq = 71) }
    // Left meanwhile, as the user's own socket says it.
    phone.database.write { take(listOf(change { membership = membership { groupId = "g1"; left = true } })) }
    delay(1_000)
    assertTrue(phone.chat(me).lines.isEmpty())
  }

  @Test
  fun othersTypingReachesTheChat() = runBlocking {
    val phone = signedIn()
    phone.account.hold("g1")
    val socket = withTimeout(10_000) { phone.account.chatSocket("g1").first { it != null }!! }
    withTimeout(10_000) { socket.state.first { it == SocketState.Current } }
    val typing = async { withTimeout(10_000) { socket.typing.first() } }
    eventually {
      server.typing("g1", "u2")
      typing.isCompleted
    }
    assertEquals("u2", typing.await().userId)
  }

  @Test
  fun readingSendsTheMarkOnceAndNeverBack() = runBlocking {
    server.write("g1", "u2", listOf("1", "2", "3"))
    val phone = signedIn()
    val me = server.userId
    phone.account.hold("g1")
    phone.chat(me) { it.lines.size == 3 }
    val chats = Chats(phone.database)
    chats.read("g1", GROUP_THREAD, me, 2)
    chats.read("g1", GROUP_THREAD, me, 1)
    assertEquals(2L, phone.chat(me).lastRead(me))
    val marked = phone.chat(me) { it.marks[me] == 2L && it.ownRead == 0L }
    assertEquals(1, marked.unread(me))
  }
}

/** The chat outbox, drafts and what the sockets say of chats, in the database alone. */
@RunWith(RobolectricTestRunner::class)
class ChatValuesTest {
  private val database = testDatabase()

  @After fun close() = database.close()

  private suspend fun send(text: String, now: Long) =
    database.write {
      chatEdit("g1", now) {
        send = chatSend { threadId = GROUP_THREAD; content = chatSendContent { words = chatSendWords { this.text = text } } }
      }
    }

  @Test
  fun aLineThatWaitedTooLongIsNotSentFromThatMoment() = runTest {
    send("機内から", now = 1_000)
    val waiting = database.read { chatState("g1", GROUP_THREAD, "me", null, now = 1_000) }
    assertFalse(waiting.waiting.single().failed)
    assertEquals(1_000L + Chat.unsentAfterMs, waiting.failsAt)
    assertEquals(setOf("g1"), database.read { chatsToSend(1_000) }.value)

    val over = 1_000L + Chat.unsentAfterMs
    assertTrue(database.read { chatState("g1", GROUP_THREAD, "me", null, now = over) }.waiting.single().failed)
    assertTrue(database.read { toSend("g1", 0, over) }.first.isEmpty())
    assertEquals(emptySet<String>(), database.read { chatsToSend(over) }.value)
  }

  @Test
  fun aLineJudgedByTheClockIsJudgedAgainAsAWelcomeCorrectsIt() = runTest {
    send("時計", now = 1_000)
    val chats = Chats(database, now = { 1_000 })
    val states = mutableListOf<Boolean>()
    val watching = launch(kotlinx.coroutines.Dispatchers.Default) {
      chats.state("g1", GROUP_THREAD, "me", null).collect { synchronized(states) { states += it.waiting.single().failed } }
    }
    eventually { synchronized(states) { states.size == 1 } }
    // A clock running far behind the server's, corrected by a Welcome, and corrected back.
    database.write { upsert(state().copy(offsetMs = Chat.unsentAfterMs.toLong())) }
    eventually { synchronized(states) { states.last() } }
    database.write { upsert(state().copy(offsetMs = 0)) }
    eventually { synchronized(states) { !states.last() } }
    watching.cancel()
    assertEquals(listOf(false, true, false), synchronized(states) { states.toList() })
  }

  @Test
  fun aLineTakenBackAfterItWentOutIsRecalledAndOneThatNeverWentIsNot() = runTest {
    val chats = Chats(database, now = { 1_000 })
    val never = send("まだ", now = 1_000)
    chats.takeBack(never)
    assertTrue(database.read { chatOutbox("g1") }.isEmpty())

    val gone = send("送った", now = 1_000)
    database.write { goOut(toSend("g1", 0, 1_000).first, 1_000) }
    chats.takeBack(gone)
    val recall = database.read { chatOutbox("g1") }.single().chatEdit
    assertEquals(ChatEdit.KindCase.RECALL, recall.kindCase)
    assertEquals(gone, recall.recall.sendOpId)
  }

  @Test
  fun anAckedTakesItsEditsOutButForTheSendsRefused() = runTest {
    val taken = send("1", now = 0)
    val refused = send("2", now = 0)
    database.write { acknowledgeChat(listOf(taken, refused), refused = listOf(refused)) }
    val left = database.read { chatOutbox("g1") }.single()
    assertEquals(refused, left.opId)
    assertTrue(left.failed)
  }

  @Test
  fun theGroupsLineTakesThePlaceOfTheOneWaiting() = runTest {
    val opId = send("おはよう", now = 0)
    database.write { takeChanges(listOf(wordsLine(1, "me", "おはよう", opId = opId)), "g1") }
    val state = database.read { chatState("g1", GROUP_THREAD, "me", null, now = 0) }
    assertTrue(state.waiting.isEmpty())
    assertEquals(opId, state.lines.single().opId)
  }

  @Test
  fun aDraftIsKeptUntilSent() = runTest {
    val chats = Chats(database)
    chats.keepDraft("g1", GROUP_THREAD, KeptDraft("行けそう"))
    assertEquals(KeptDraft("行けそう"), chats.draft("g1", GROUP_THREAD))
    chats.keepDraft("g1", GROUP_THREAD, KeptDraft(" "))
    assertNull(chats.draft("g1", GROUP_THREAD))
    chats.keepDraft("g1", GROUP_THREAD, KeptDraft("行けそう"))
    chats.send("g1", GROUP_THREAD, "行けそう")
    assertNull(chats.draft("g1", GROUP_THREAD))
  }

  @Test
  fun aResetTakesTheLinesAndKeepsTheOutboxAndLeavingTakesBoth() = runTest {
    database.listGroup()
    send("待ってる", now = 0)
    database.write {
      takeChanges(listOf(wordsLine(1, "u2")), "g1")
      resetGroup("g1")
    }
    val reset = database.read { chatState("g1", GROUP_THREAD, "me", null, now = 0) }
    assertTrue(reset.lines.isEmpty())
    assertEquals(1, reset.waiting.size)

    database.write { take(listOf(change { membership = membership { groupId = "g1"; left = true } })) }
    assertTrue(database.read { chatOutbox("g1") }.isEmpty())
  }

  @Test
  fun theUsersSocketSaysWhatIsUnreadBlockedAndTurnedOff() = runTest {
    database.write {
      take(
        listOf(
          change { unreadCount = unreadCount { groupId = "g1"; threadId = GROUP_THREAD; count = 3 } },
          change { block = block { userId = "u2"; on = true } },
          change { chatMute = chatMute { groupId = "g1"; threadId = GROUP_THREAD; muted = true } },
          change { chatNotifications = chatNotifications { mentionsWhenMuted = false } },
        )
      )
    }
    assertEquals(3, Chats(database).summary("g1", GROUP_THREAD, "me").first().unread)
    database.write { reset() }
    assertEquals(0, Chats(database).summary("g1", GROUP_THREAD, "me").first().unread)
  }

  @Test
  fun aReplyChangeAndUnsendShowAtOnceAndAQuotedLineIsHeldBesideTheLines() = runTest {
    val chats = Chats(database, now = { 0 })
    database.write { takeChanges(listOf(wordsLine(1, "u2", "ここ https://a.example"), wordsLine(2, "me", "うん")), "g1") }
    chats.send("g1", GROUP_THREAD, "行く", replyTo = 1)
    chats.change("g1", GROUP_THREAD, 2, "うん、行く")
    val shown = database.read { chatState("g1", GROUP_THREAD, "me", from = 2, now = 0) }
    assertEquals(1L, shown.waiting.single().replyTo)
    assertEquals(LineContent.Words("うん、行く", edited = true), shown.lines.single().content)
    // The line answered is not laid out (from 2), and is held beside the lines.
    assertEquals(LineContent.Words("ここ https://a.example"), shown.quoted[1L]?.content)

    chats.unsend("g1", GROUP_THREAD, 2)
    assertEquals(LineContent.Unsent, database.read { chatState("g1", GROUP_THREAD, "me", from = 2, now = 0) }.lines.single().content)
  }

  @Test
  fun anEditKeepsItsPageWhileItsFirstLinkStaysAndElseTakesTheNewOnes() = runTest {
    val chats = Chats(database, now = { 0 })
    val page = linkPreview { url = "https://a.example"; title = "A" }
    val next = linkPreview { url = "https://b.example"; title = "B" }
    val line = wordsLine(1, "me", "ここ https://a.example").copy { content = content.copy { words = words.copy { preview = page } } }
    database.write { takeChanges(listOf(line), "g1") }
    suspend fun shown() = database.read { chatState("g1", GROUP_THREAD, "me", null, now = 0) }.lines.single().content as LineContent.Words

    chats.change("g1", GROUP_THREAD, 1, "ここどう？ https://a.example", next)
    assertEquals(page, shown().preview)
    chats.change("g1", GROUP_THREAD, 1, "やっぱり https://b.example", next)
    assertEquals(next, shown().preview)
  }

  @Test
  fun aChatsPinsHoldLinesFarBackAndTheMembersShowAtOnce() = runTest {
    val chats = Chats(database, now = { 0 })
    val old = wordsLine(1, "u2", "ずっと前").copy { pinnedOrder = 9 }
    database.write { takeChanges(listOf(old, wordsLine(5, "u2", "e"), wordsLine(6, "me", "f")), "g1") }
    suspend fun pins() = database.read { chatState("g1", GROUP_THREAD, "me", from = 5, now = 0) }.pins.map { it.seq }
    // 1 is held for its pin, apart from the lines laid out.
    assertEquals(listOf(1L), pins())
    // Pinning says what it did, by the pins the device has as it writes.
    assertEquals(PinStep(listOf(6L, 1L)), chats.pin("g1", GROUP_THREAD, 6, on = true))
    assertEquals(listOf(6L, 1L), pins())
    chats.pin("g1", GROUP_THREAD, 1, on = false)
    assertEquals(listOf(6L), pins())
    // Taking a line back takes its pin with it.
    chats.unsend("g1", GROUP_THREAD, 6)
    assertTrue(pins().isEmpty())
  }

  @Test
  fun aVoteShowsWhileThePollIsOpenAndSettlingPinsIt() = runTest {
    database.write { upsert(state().copy(owner = "me")) }
    val chats = Chats(database, now = { 0 })
    val poll = wordsLine(1, "u2").copy { content = chatContent { this.poll = chatPoll { days += listOf("2026-11-01", "2026-11-03") } } }
    database.write { takeChanges(listOf(poll), "g1") }
    suspend fun shown() = database.read { chatState("g1", GROUP_THREAD, "me", null, now = 0) }
    chats.vote("g1", GROUP_THREAD, 1, "2026-11-03", on = true)
    assertEquals(listOf("me"), voters((shown().lines.single().content as LineContent.Poll).poll, "2026-11-03"))

    chats.decide("g1", GROUP_THREAD, 1, "2026-11-03")
    val settled = shown()
    assertEquals("2026-11-03", (settled.lines.single().content as LineContent.Poll).poll.decided)
    assertEquals(listOf(1L), settled.pins.map { it.seq })
    // A settled poll takes no more votes.
    chats.vote("g1", GROUP_THREAD, 1, "2026-11-01", on = true)
    assertTrue(voters((shown().lines.single().content as LineContent.Poll).poll, "2026-11-01").isEmpty())
  }

  @Test
  fun theMembersReactionShowsAtOnceAsTheirs() = runTest {
    database.write { upsert(state().copy(owner = "me")) }
    val chats = Chats(database, now = { 0 })
    database.write { takeChanges(listOf(wordsLine(1, "u2")), "g1") }
    chats.react("g1", GROUP_THREAD, 1, "❤️", on = true)
    assertEquals(listOf(LineReaction("❤️", listOf("me"))), database.read { chatState("g1", GROUP_THREAD, "me", null, now = 0) }.lines.single().reactions)
    chats.react("g1", GROUP_THREAD, 1, "❤️", on = false)
    assertTrue(database.read { chatState("g1", GROUP_THREAD, "me", null, now = 0) }.lines.single().reactions.isEmpty())
  }

  @Test
  fun theListHasTheChatsWithALineALineOnItsWayOrADraft() = runTest {
    val chats = Chats(database)
    database.write { takeChanges(listOf(wordsLine(1, "u2", thread = directThread("me", "u2"))), "g1") }
    chats.keepDraft("g1", directThread("me", "u3"), KeptDraft("あとで"))
    database.write {
      chatEdit("g1", 0) {
        send = chatSend { threadId = directThread("me", "u4"); content = chatSendContent { words = chatSendWords { text = "やあ" } } }
      }
    }
    assertEquals(
      setOf(directThread("me", "u2"), directThread("me", "u3"), directThread("me", "u4")),
      chats.threads("g1").first(),
    )
  }

  @Test
  fun aChatMarksAnUnreadMentionAndBeingTurnedOff() = runTest {
    val chats = Chats(database, now = { 0 })
    database.write {
      take(listOf(change { unreadCount = unreadCount { groupId = "g1"; threadId = GROUP_THREAD; count = 2; mentions = 1 } }))
      takeChanges(listOf(wordsLine(1, "u2", "<@me> 見て"), wordsLine(2, "u2", "ね")), "g1")
    }
    val counted = chats.summary("g1", GROUP_THREAD, "me").first()
    assertTrue(counted.mentioned)
    assertFalse(counted.muted)

    // Read past the mention, the read still waiting: counted on the device, with no mention left.
    chats.read("g1", GROUP_THREAD, "me", 1)
    val read = chats.summary("g1", GROUP_THREAD, "me").first()
    assertEquals(1, read.unread)
    assertFalse(read.mentioned)

    database.write { take(listOf(change { chatMute = chatMute { groupId = "g1"; threadId = GROUP_THREAD; muted = true } })) }
    assertTrue(chats.summary("g1", GROUP_THREAD, "me").first().muted)
  }
}
