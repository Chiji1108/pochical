package app.pochical.kit

/**
 * What a chat's composer holds (spec/chat.md, Replies; Editing and unsending): the words as written
 * (mentions as @name) with the members [picked] for them, the line it answers ([replyTo]) or the
 * line of the member's own it changes ([editing]), by seq and never both, the days brought to share
 * (共有する日) and the [photos] picked, both sent before the words, and the link whose page × took
 * off ([previewRemoved]), until sent or changed. As iOS's `Writing`; how it switches between
 * answering a line and changing one is pinned by spec/vectors/chat.json, composer.
 */
data class Writing<Photo>(
  val text: String = "",
  val picked: List<PickedMember> = emptyList(),
  val replyTo: Long? = null,
  val editing: Long? = null,
  val days: List<String>? = null,
  val photos: List<Photo> = emptyList(),
  val previewRemoved: String? = null,
) {
  /** The words as they would be sent, each picked member's whole @name as their mention. */
  val sent: String
    get() = withMentions(text, picked)

  /**
   * 返信: answering a line in place of changing one lets the edit go, and its words with it, which
   * were that line's; else what was written stays, and what goes with it.
   */
  fun answer(seq: Long): Writing<Photo> = (if (editing != null) Writing() else this).copy(replyTo = seq)

  /** 編集: the line's words ([text], as sent) alone in place of all that was written. */
  fun change(seq: Long, text: String, nameOf: (String) -> String): Writing<Photo> = of<Photo>(text, nameOf).copy(editing = seq)

  /** × on the bar: an edit goes with its words; a reply's words stay, and what goes with them. */
  fun stop(): Writing<Photo> = if (editing != null) Writing() else copy(replyTo = null)

  /** Days brought to share start a message, as 返信 does: an edit goes with its words, as it takes only words. */
  fun share(days: List<String>): Writing<Photo> = (if (editing != null) Writing() else this).copy(days = days)

  companion object {
    /** Words as sent (<@id>) put in the composer, their mentions as @name again and still picked. */
    fun <Photo> of(text: String, nameOf: (String) -> String, replyTo: Long? = null, editing: Long? = null): Writing<Photo> =
      Writing(
        text = plainText(text, nameOf),
        picked = mentions(text).distinct().map { PickedMember(it, nameOf(it)) },
        replyTo = replyTo,
        editing = editing,
      )
  }
}
