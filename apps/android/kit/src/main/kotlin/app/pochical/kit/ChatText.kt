package app.pochical.kit

import java.net.URI
import java.net.URISyntaxException

// A chat message's words as spec/chat.md has them: its links, and the members it mentions
// (spec/vectors/chat-text.json), as iOS's ChatText.swift and the prototype's chat-text.ts cut them.
// Ids and the characters a URL is written in are ASCII, so every platform cuts a message alike.

/** One piece of a message: words, a link ([url]), or a mention kept as `<@id>` ([mention]). */
data class TextPart(val text: String, val url: String? = null, val mention: String? = null)

/** A link (http:// or https://, any case, over the characters a URL is written in) or a mention. */
private val LINK_OR_MENTION = Regex("""<@([A-Za-z0-9_-]+)>|((?i:https?)://[A-Za-z0-9_\-.~:/?#\[\]@!$&'()*+,;=%]+)""")

/** What closes a sentence rather than the address when it comes last. */
private const val TRAILING = ".,!?:;'*"

/** The address without what closes the sentence around it: a full stop, a comma, or a bracket opened before it. */
private fun trimLink(found: String): String {
  var link = found.trimEnd { it in TRAILING }
  for ((open, close) in listOf('(' to ')', '[' to ']')) {
    while (link.lastOrNull() == close && link.count { it == close } > link.count { it == open }) {
      link = link.dropLast(1).trimEnd { it in TRAILING }
    }
  }
  return link
}

/** Whether the link has a host: `https://` alone is not one. */
private fun hasHost(link: String): Boolean {
  val scheme = link.indexOf("://").takeIf { it >= 0 } ?: return false
  val authority = link.substring(scheme + 3).takeWhile { it !in "/?#" }
  return authority.substringAfterLast('@').isNotEmpty()
}

/** The message cut into its words, links and mentions, in order (spec/vectors/chat-text.json, textParts). */
fun textParts(text: String): List<TextPart> {
  val parts = mutableListOf<TextPart>()
  var at = 0
  for (match in LINK_OR_MENTION.findAll(text)) {
    val start = match.range.first
    val part =
      match.groups[1]?.let { TextPart(match.value, mention = it.value) }
        ?: trimLink(match.value).takeIf(::hasHost)?.let { TextPart(it, url = it) }
        ?: continue
    if (start > at) parts += TextPart(text.substring(at, start))
    parts += part
    at = start + part.text.length
  }
  if (at < text.length) parts += TextPart(text.substring(at))
  return parts
}

/** The members a message mentions, by their id, in order. */
fun mentions(text: String): List<String> = textParts(text).mapNotNull { it.mention }

/** The message as words alone, each mention as @ and the member's name: for コピー, the chat list, a quote. */
fun plainText(text: String, nameOf: (String) -> String): String =
  textParts(text).joinToString("") { part -> part.mention?.let { "@${nameOf(it)}" } ?: part.text }

/** The link a message's preview is for: its first. */
fun firstLink(text: String): String? = textParts(text).firstNotNullOfOrNull { it.url }

/** Whether new words keep the line's page: while their first link is the line's (spec/vectors/chat.json, edited). */
fun keepsPreview(text: String, editedTo: String): Boolean = firstLink(text) == firstLink(editedTo)

/** The link a page is asked for while writing: the words' first, unless it is one of Pochical's invitations. */
fun previewLink(text: String): String? = firstLink(text)?.takeIf { inviteCode(it) == null }

/** A link's host without a leading www., as a page's site is named without its own (spec/vectors/chat-text.json, site). */
fun site(url: String): String {
  val host =
    try {
      URI(url).host
    } catch (_: URISyntaxException) {
      null
    } ?: return url
  return host.removePrefix("www.")
}
