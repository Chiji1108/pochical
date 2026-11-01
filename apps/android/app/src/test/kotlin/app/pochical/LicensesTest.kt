package app.pochical

import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** ライセンス (spec/calendar.md, ライセンス), from what this build wrote of its libraries. */
@RunWith(RobolectricTestRunner::class)
class LicensesTest {
  private val list = licensed(RuntimeEnvironment.getApplication())

  @Test
  fun everythingListedHasItsLicensesTextOrWhereToReadIt() {
    // The plugin fills a license's text from SPDX as it builds: a build that could not reach it
    // would list the names with nothing to read.
    val bare = list.filter { licensed -> licensed.licenses.isEmpty() || licensed.licenses.any { it.text == null && it.url == null } }
    assertTrue("No license to read for ${bare.map { it.name }}", bare.isEmpty())
    val apache = list.flatMap { it.licenses }.filter { it.name == "Apache License 2.0" }
    assertTrue(apache.isNotEmpty() && apache.all { it.text != null })
  }

  @Test
  fun whatTheAppCarriesBesidesItsLibrariesIsListed() {
    val names = list.map { it.name }
    assertTrue(names.containsAll(listOf("Material Symbols", "Phosphor Icons", "holiday_jp", "okhttp")))
  }
}
