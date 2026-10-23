package app.pochical.kit

import java.io.File
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromStream
import org.junit.Assert.assertEquals

/** The vectors files' JSON, each file read for the parts this platform checks. */
val vectorJson = Json { ignoreUnknownKeys = true }

/**
 * A file of spec/vectors, the cases every platform checks its own code against, read from the
 * repository this project is in (kit/build.gradle.kts names where).
 */
@OptIn(ExperimentalSerializationApi::class)
inline fun <reified T> vectors(name: String): T {
  val directory = System.getProperty("pochical.vectors") ?: error("The vectors directory is not set")
  return File(directory, "$name.json").inputStream().use { vectorJson.decodeFromStream(it) }
}

/** One case of a vectors file, named as the file names it. */
interface VectorCase {
  val name: String
}

/**
 * Checks every case, naming each whose [actual] is not its [expected], so one run shows them all.
 */
fun <C : VectorCase, T> List<C>.checkEach(expected: (C) -> T, actual: (C) -> T) {
  check(isNotEmpty()) { "No cases" }
  val failed = mapNotNull { case ->
    val want = expected(case)
    val got = actual(case)
    if (want == got) null else "${case.name}: expected $want, got $got"
  }
  assertEquals("", failed.joinToString("\n"))
}
