package app.pochical.kit

import app.pochical.v1.calendarAddPreference
import app.pochical.v1.headingPreference
import app.pochical.v1.lookPreference
import app.pochical.v1.markOptions
import app.pochical.v1.periodPreference
import app.pochical.v1.themePreference
import app.pochical.v1.weekPreference
import com.google.protobuf.MessageLite
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

@Serializable
private data class PreferenceVectors(
  val messages: Map<String, String>,
  val defaults: Map<String, JsonObject>,
  val roundTrips: List<Case>,
  val unreadable: List<Case>,
) {
  @Serializable data class Case(override val name: String, val key: String, val value: JsonObject) : VectorCase
}

private val preferenceVectors = vectors<PreferenceVectors>("preferences")

/** A key's value as the vectors write it, in the JSON form of the message the key names. */
private fun message(key: String, json: JsonObject): MessageLite? {
  fun JsonObject.bool(name: String) = this[name]?.jsonPrimitive?.boolean ?: false
  fun JsonObject.int(name: String) = this[name]?.jsonPrimitive?.int ?: 0
  fun JsonObject.string(name: String) = this[name]?.jsonPrimitive?.content ?: ""
  fun JsonObject.map(name: String) = this[name]?.jsonObject.orEmpty()
  fun options(json: JsonElement?) = markOptions {
    val options = json?.jsonObject ?: return@markOptions
    names = options.bool("names")
    off = options.string("off")
    offs.putAll(options.map("offs").mapValues { it.value.jsonPrimitive.content })
  }
  return when (key) {
    "theme" -> themePreference { id = json.string("id") }
    "look" ->
      lookPreference {
        style = json.string("style")
        fill = json.bool("fill")
        colored = json.bool("colored")
        icon = options(json["icon"])
        emoji = options(json["emoji"])
        badge = options(json["badge"])
      }
    "week" ->
      weekPreference {
        start = json.int("start")
        sunday = json.bool("sunday")
        saturday = json.bool("saturday")
        holiday = json.bool("holiday")
      }
    "period" -> periodPreference { startDay = json.int("startDay") }
    "heading" ->
      headingPreference {
        english = json.bool("english")
        surprise = json.bool("surprise")
        json["sky"]?.let { sky = it.jsonPrimitive.content }
      }
    "picture" -> options(json)
    "calendarAdd" ->
      calendarAddPreference {
        chosen.putAll(json.map("chosen").mapValues { it.value.jsonPrimitive.boolean })
        notes = json.bool("notes")
        people = json.bool("people")
      }
    else -> null
  }
}

/** The account's values, as a device takes them: each its key's message encoded, and for a key the app has none of, any bytes. */
private fun account(key: String, value: JsonObject): Map<String, ByteArray> =
  mapOf(key to (message(key, value)?.toByteArray() ?: value.toString().toByteArray()))

class PreferencesTest {
  @Test
  fun eachKeyIsTheMessageItNames() {
    assertEquals(preferenceVectors.messages, preferenceParts.associate { it.key to it.message })
  }

  @Test
  fun aDeviceWhereNothingWasSetHoldsEachKeysDefault() {
    assertEquals(expected(preferenceVectors.defaults), held(DeviceSettings()))
  }

  @Test
  fun aPreferenceTakenIsHeldAgain() {
    preferenceVectors.roundTrips.checkEach(
      expected = { expected(preferenceVectors.defaults + (it.key to it.value)) },
      actual = { held(DeviceSettings().adopting(account(it.key, it.value))) },
    )
  }

  @Test
  fun aPreferenceTheDeviceCannotTakeLeavesItsOwn() {
    val taken =
      preferenceVectors.roundTrips.fold(DeviceSettings()) { settings, case -> settings.adopting(account(case.key, case.value)) }
    preferenceVectors.unreadable.checkEach(expected = { taken }, actual = { taken.adopting(account(it.key, it.value)) })
  }

  @Test
  fun onlyTheKeysAChangeTouchesAreSent() {
    val before = DeviceSettings()
    val after = before.copy(themeId = "zen", appearance = Appearance.Dark, picture = before.picture.copy(dark = true))
    assertEquals(setOf("theme"), after.preferencesChanged(before).keys)
  }

  /** Each key's value as the device holds it, read as the key's message. */
  private fun held(settings: DeviceSettings): Map<String, MessageLite> =
    settings.preferences.mapValues { (key, bytes) -> message(key, JsonObject(emptyMap()))!!.parserForType.parseFrom(bytes) }

  /** Each key's value of [json], as the key's message. */
  private fun expected(json: Map<String, JsonObject>): Map<String, MessageLite> =
    json.mapValues { (key, value) -> message(key, value)!! }
}
