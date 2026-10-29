package app.pochical

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The cases of a spec/vectors file under `key`, the cases every platform checks its own code
 * against, read from the repository this project is in (apps/android/build.gradle.kts names where).
 */
fun vectors(file: String, key: String): List<JsonObject> {
  val directory = System.getProperty("pochical.vectors") ?: error("The vectors directory is not set")
  val json = File(directory, "$file.json").readText()
  return Json.parseToJsonElement(json).jsonObject.getValue(key).jsonArray.map { it.jsonObject }
}

/** The string at `key`; none when it is missing or null. */
fun JsonObject.string(key: String): String? = this[key]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content

fun JsonObject.name(): String = string("name")!!

/** The array at `key` as strings; none when it is missing or null. */
fun JsonObject.strings(key: String): List<String>? =
  this[key]?.takeUnless { it is JsonNull }?.jsonArray?.map(JsonElement::jsonPrimitive)?.map { it.content }
