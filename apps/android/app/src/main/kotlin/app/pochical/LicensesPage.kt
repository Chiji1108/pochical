package app.pochical

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.pochical.design.Notices
import com.mikepenz.aboutlibraries.Libs
import com.mikepenz.aboutlibraries.util.withJson
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * What the app is built with from other projects, under one of [licenses]: [id] names it to its
 * page.
 */
data class Licensed(val id: String, val name: String, val licenses: List<LicenseTerms>)

/** One license: its [text] where the build has it, else where it is read ([url]). */
data class LicenseTerms(val name: String, val text: String?, val url: String?)

/**
 * Everything the app is built with from other projects, by name (spec/calendar.md, ライセンス): the
 * libraries this build resolves and what it carries besides (res/raw/aboutlibraries.json, which
 * AboutLibraries' plugin writes), and what design/ writes in from other projects (Notices).
 */
fun licensed(context: Context): List<Licensed> {
  val libs = Libs.Builder().withJson(context, R.raw.aboutlibraries).build()
  val libraries =
    libs.libraries.map { library ->
      Licensed(
        library.uniqueId,
        library.name,
        library.licenses.map { LicenseTerms(it.name, it.licenseContent?.takeIf(String::isNotBlank), it.url) },
      )
    }
  val notices = Notices.all.map { Licensed(it.name, it.name, listOf(LicenseTerms(it.name, it.text, it.url))) }
  return (libraries + notices).sortedBy { it.name.lowercase(Locale.ROOT) }
}

/** [licensed], read off the main thread: null until it is. */
@Composable
private fun rememberLicensed(): List<Licensed>? {
  val context = LocalContext.current
  val list by produceState<List<Licensed>?>(null, context) { value = withContext(Dispatchers.Default) { licensed(context) } }
  return list
}

/** ライセンス, from 設定's ポチカルについて: everything licensed, each opening its license. */
@Composable
fun LicensesPage(navigation: PageNavigation) {
  val list = rememberLicensed()
  SettingsPage(stringResource(R.string.settings_licenses), onBack = navigation::back) { padding ->
    LazyColumn(contentPadding = padding) {
      if (list != null) {
        sectionRows(list, key = Licensed::id) { licensed ->
          SettingsRow(
            licensed.name,
            icon = null,
            supporting = licensed.licenses.joinToString("・") { it.name },
            onClick = { navigation.open(RootPage.License(licensed.id)) },
          )
        }
      }
    }
  }
}

/**
 * One of ライセンス's: each of its licenses' text, which can be selected and copied, or a row to
 * read it on the web where the build has no text for it (a terms of service).
 */
@Composable
fun LicensePage(id: String, onBack: () -> Unit) {
  val context = LocalContext.current
  val licensed = rememberLicensed()?.find { it.id == id }
  SettingsPage(licensed?.name.orEmpty(), onBack, collapsing = false) { padding ->
    Column(Modifier.padding(padding).verticalScroll(rememberScrollState())) {
      val (texts, links) = licensed?.licenses.orEmpty().partition { it.text != null }
      if (links.isNotEmpty()) {
        SettingsSection {
          for (license in links) {
            row {
              SettingsRow(
                license.name,
                R.drawable.ic_description,
                onClick = license.url?.let { url -> { openLink(context, url) } },
                end = if (license.url != null) RowEnd.Outside else RowEnd.None,
                onClickLabel = stringResource(R.string.settings_opens_browser),
              )
            }
          }
        }
      }
      SelectionContainer {
        Column(Modifier.padding(16.dp)) {
          for (license in texts) {
            Text(license.text.orEmpty(), Modifier.padding(bottom = 24.dp), style = MaterialTheme.typography.bodySmall)
          }
        }
      }
    }
  }
}
