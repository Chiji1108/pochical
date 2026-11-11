package app.pochical.kit

import kotlinx.coroutines.Deferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** The group the person made or joined, and whether the face they picked on the way was kept in it. */
data class InGroup(val groupId: String, val faceKept: Boolean)

/** An invitation's code, and the name the person joins its group as. */
data class JoinAsk(val code: String, val displayName: String)

/**
 * The person on their way into a group, made (グループを作る) or joined (参加の画面): one call at a
 * time, [enter]'s, which is the kit's from the moment it is asked for, whatever becomes of the
 * page that asked (spec/sync-protocol.md, Groups). The screen turned under the page neither stops
 * it nor loses its answer: the page drawn again finds it [underWay] and waits on. Asked for again
 * while one is under way, a second tap before the page is drawn busy, it is that one. A page left
 * for good ([left]) stops nothing either: the person is in the group once the server has it, the
 * group in their list, and the call is forgotten as it ends; the page opened again meanwhile finds
 * it under way, so the same group is not asked for twice by mistake (#1178).
 */
class GoingIn<Asked>(private val enter: (Asked, JoinFace, asUsual: Boolean) -> Deferred<InGroup>) {
  /** A call: what was [asked] for, and its [answer], which fails as the call does. */
  class Call<Asked> internal constructor(val asked: Asked, val answer: Deferred<InGroup>) {
    internal var waitedOn = true
  }

  private val mutableUnderWay = MutableStateFlow<Call<Asked>?>(null)

  /** The call under way, or ended and not yet taken by the page that waits on it. */
  val underWay: StateFlow<Call<Asked>?> = mutableUnderWay.asStateFlow()

  /** Begins going in as [asked] with [face], or gives the call already under way. */
  @Synchronized
  fun begin(asked: Asked, face: JoinFace, asUsual: Boolean): Call<Asked> {
    mutableUnderWay.value?.let { return it }
    val call = Call(asked, enter(asked, face, asUsual))
    mutableUnderWay.value = call
    call.answer.invokeOnCompletion { ended(call) }
    return call
  }

  /** A page waits on [call] (again), and will take its answer. */
  @Synchronized
  fun waitOn(call: Call<Asked>) {
    call.waitedOn = true
  }

  /** The page waiting on [call] has its answer: nothing is under way any more. */
  @Synchronized
  fun took(call: Call<Asked>) {
    mutableUnderWay.compareAndSet(call, null)
  }

  /** The page that waited on [call] is gone for good: the call goes on, and is forgotten as it ends. */
  @Synchronized
  fun left(call: Call<Asked>) {
    call.waitedOn = false
    if (call.answer.isCompleted) mutableUnderWay.compareAndSet(call, null)
  }

  @Synchronized
  private fun ended(call: Call<Asked>) {
    if (!call.waitedOn) mutableUnderWay.compareAndSet(call, null)
  }
}
