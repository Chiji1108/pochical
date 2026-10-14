// Code generated from design/ by `mise run gen`. Do not edit.

package app.pochical.design

import androidx.compose.ui.graphics.Color

/** おたのしみ's skies (design/src/skies.ts): three lights each, left, middle and right, in light mode, on the dark screen, and on the grounds of the テーマ that color their own (by the テーマ's id). */
class SkyLights(val light: List<Color>, val dark: List<Color>, val darkOn: Map<String, List<Color>>) {
  fun colors(dark: Boolean, theme: String): List<Color> =
    if (dark) darkOn[theme] ?: this.dark else light
}

object Skies {
  val anyone = listOf("asayake", "hakumei", "koori", "mikan", "momo", "ramune", "wakakusa", "yunagi")

  fun own(theme: String): String = "theme-$theme"

  const val CHANGE_SECONDS = 0.9f
  const val BREATH_SECONDS = 9f

  val lights: Map<String, SkyLights> = mapOf(
    "asayake" to SkyLights(listOf(Color(0xFFFEEADD), Color(0xFFDDF2FF), Color(0xFFF1EBFE)), listOf(Color(0xFF321906), Color(0xFF022435), Color(0xFF241A35)), mapOf("tsukiyo" to listOf(Color(0xFF341A07), Color(0xFF032536), Color(0xFF251C36)), "kokuban" to listOf(Color(0xFF3A200E), Color(0xFF092B3D), Color(0xFF2B223C)))),
    "hakumei" to SkyLights(listOf(Color(0xFFEEECFE), Color(0xFFE3F0FE), Color(0xFFFEE8E9)), listOf(Color(0xFF201C36), Color(0xFF0B2237), Color(0xFF341519)), mapOf("tsukiyo" to listOf(Color(0xFF211D38), Color(0xFF0D2339), Color(0xFF36171A)), "kokuban" to listOf(Color(0xFF27233E), Color(0xFF13293F), Color(0xFF3D1D20)))),
    "koori" to SkyLights(listOf(Color(0xFFD3F6FF), Color(0xFFEBEDFF), Color(0xFFD3F8EF)), listOf(Color(0xFF01252D), Color(0xFF1C1D38), Color(0xFF002721)), mapOf("tsukiyo" to listOf(Color(0xFF00272F), Color(0xFF1D1E39), Color(0xFF012822)), "kokuban" to listOf(Color(0xFF012D36), Color(0xFF232540), Color(0xFF002F29)))),
    "mikan" to SkyLights(listOf(Color(0xFFFFEBD2), Color(0xFFF4F0D1), Color(0xFFFFE8EC)), listOf(Color(0xFF2E1C01), Color(0xFF262101), Color(0xFF34151D)), mapOf("tsukiyo" to listOf(Color(0xFF2F1E02), Color(0xFF272201), Color(0xFF35161E)), "kokuban" to listOf(Color(0xFF362407), Color(0xFF2D2806), Color(0xFF3C1C24)))),
    "momo" to SkyLights(listOf(Color(0xFFFEE8EB), Color(0xFFFEEBD9), Color(0xFFFAE7FF)), listOf(Color(0xFF34151B), Color(0xFF301B03), Color(0xFF2B182F)), mapOf("tsukiyo" to listOf(Color(0xFF36161C), Color(0xFF321C04), Color(0xFF2C1930)), "kokuban" to listOf(Color(0xFF3C1D22), Color(0xFF38220A), Color(0xFF321F37)))),
    "ramune" to SkyLights(listOf(Color(0xFFD7F8E8), Color(0xFFF2F1D2), Color(0xFFD3F6FF)), listOf(Color(0xFF01281A), Color(0xFF242101), Color(0xFF01252D)), mapOf("tsukiyo" to listOf(Color(0xFF02291C), Color(0xFF252302), Color(0xFF00272F)), "kokuban" to listOf(Color(0xFF092F21), Color(0xFF2B2907), Color(0xFF012D36)))),
    "wakakusa" to SkyLights(listOf(Color(0xFFE6F4D9), Color(0xFFF7EFD1), Color(0xFFD1F7F7)), listOf(Color(0xFF182509), Color(0xFF282000), Color(0xFF002627)), mapOf("tsukiyo" to listOf(Color(0xFF19260B), Color(0xFF292101), Color(0xFF012828)), "kokuban" to listOf(Color(0xFF1F2C11), Color(0xFF2F2706), Color(0xFF012F2F)))),
    "yunagi" to SkyLights(listOf(Color(0xFFFEE9E4), Color(0xFFFEE7F1), Color(0xFFEAEEFE)), listOf(Color(0xFF34170F), Color(0xFF321624), Color(0xFF1A1E38)), mapOf("tsukiyo" to listOf(Color(0xFF361810), Color(0xFF331725), Color(0xFF1B1F39)), "kokuban" to listOf(Color(0xFF3D1E16), Color(0xFF3A1D2B), Color(0xFF212540)))),
    "theme-cocoa" to SkyLights(listOf(Color(0xFFFEEAE0), Color(0xFFFCECD7), Color(0xFFFEE8EB)), listOf(Color(0xFF301A10), Color(0xFF2C1D08), Color(0xFF31181C)), mapOf("tsukiyo" to listOf(Color(0xFF311B11), Color(0xFF2D1F0A), Color(0xFF32191D)), "kokuban" to listOf(Color(0xFF382117), Color(0xFF332510), Color(0xFF391F23)))),
    "theme-kissa" to SkyLights(listOf(Color(0xFFFEEADB), Color(0xFFFEE9E4), Color(0xFFFBEDD1)), listOf(Color(0xFF311A05), Color(0xFF34170F), Color(0xFF2B1E00)), mapOf("tsukiyo" to listOf(Color(0xFF331B06), Color(0xFF361810), Color(0xFF2D1F01)), "kokuban" to listOf(Color(0xFF39210C), Color(0xFF3D1E16), Color(0xFF332506)))),
    "theme-kokuban" to SkyLights(listOf(Color(0xFFDCF6E9), Color(0xFFD7F5FC), Color(0xFFFEE7F3)), listOf(Color(0xFF0A261C), Color(0xFF03252C), Color(0xFF2E1825)), mapOf("tsukiyo" to listOf(Color(0xFF0C281D), Color(0xFF04262E), Color(0xFF2F1A26)), "kokuban" to listOf(Color(0xFF122E23), Color(0xFF0B2D34), Color(0xFF361F2C)))),
    "theme-matcha" to SkyLights(listOf(Color(0xFFEBF3D5), Color(0xFFF9EED1), Color(0xFFFEE7F1)), listOf(Color(0xFF1D2405), Color(0xFF2A1F00), Color(0xFF321624)), mapOf("tsukiyo" to listOf(Color(0xFF1F2506), Color(0xFF2B2001), Color(0xFF331725)), "kokuban" to listOf(Color(0xFF252B0C), Color(0xFF312606), Color(0xFF3A1D2B)))),
    "theme-milktea" to SkyLights(listOf(Color(0xFFFEEADD), Color(0xFFFAEDD7), Color(0xFFFEE9E8)), listOf(Color(0xFF2F1B0D), Color(0xFF2A1E08), Color(0xFF311818)), mapOf("tsukiyo" to listOf(Color(0xFF301C0E), Color(0xFF2C1F09), Color(0xFF32191A)), "kokuban" to listOf(Color(0xFF372214), Color(0xFF32250F), Color(0xFF391F1F)))),
    "theme-pochical" to SkyLights(listOf(Color(0xFFF4F0D1), Color(0xFFDCF7E1), Color(0xFFD9F4FF)), listOf(Color(0xFF262101), Color(0xFF0C2713), Color(0xFF002531)), mapOf("tsukiyo" to listOf(Color(0xFF272201), Color(0xFF0D2814), Color(0xFF012632)), "kokuban" to listOf(Color(0xFF2D2806), Color(0xFF142E1A), Color(0xFF032C3A)))),
    "theme-sakura" to SkyLights(listOf(Color(0xFFFEE9E4), Color(0xFFFEE8EF), Color(0xFFF1EBFE)), listOf(Color(0xFF34170F), Color(0xFF331522), Color(0xFF241A35)), mapOf("tsukiyo" to listOf(Color(0xFF361810), Color(0xFF341723), Color(0xFF251C36)), "kokuban" to listOf(Color(0xFF3D1E16), Color(0xFF3B1D29), Color(0xFF2B223C)))),
    "theme-soda" to SkyLights(listOf(Color(0xFFD5F8EA), Color(0xFFD3F6FF), Color(0xFFF4F0D1)), listOf(Color(0xFF00281D), Color(0xFF01252D), Color(0xFF262101)), mapOf("tsukiyo" to listOf(Color(0xFF01291E), Color(0xFF00272F), Color(0xFF272201)), "kokuban" to listOf(Color(0xFF052F24), Color(0xFF012D36), Color(0xFF2D2806)))),
    "theme-sumi" to SkyLights(listOf(Color(0xFFE7F0F9), Color(0xFFF3EEE3), Color(0xFFF0ECF8)), listOf(Color(0xFF19212A), Color(0xFF242015), Color(0xFF221E29)), mapOf("tsukiyo" to listOf(Color(0xFF1A222B), Color(0xFF252117), Color(0xFF23202A)), "kokuban" to listOf(Color(0xFF202931), Color(0xFF2B271C), Color(0xFF292630)))),
    "theme-sumire" to SkyLights(listOf(Color(0xFFF5E9FE), Color(0xFFEBEDFF), Color(0xFFFEE9E8)), listOf(Color(0xFF281932), Color(0xFF1C1D38), Color(0xFF351616)), mapOf("tsukiyo" to listOf(Color(0xFF291A33), Color(0xFF1D1E39), Color(0xFF361717)), "kokuban" to listOf(Color(0xFF2F203A), Color(0xFF232540), Color(0xFF3D1D1D)))),
    "theme-tsukiyo" to SkyLights(listOf(Color(0xFFEEECFE), Color(0xFFE3F0FE), Color(0xFFD3F6FF)), listOf(Color(0xFF201C36), Color(0xFF0B2237), Color(0xFF01252D)), mapOf("tsukiyo" to listOf(Color(0xFF211D38), Color(0xFF0D2339), Color(0xFF00272F)), "kokuban" to listOf(Color(0xFF27233E), Color(0xFF13293F), Color(0xFF012D36)))),
    "theme-zen" to SkyLights(listOf(Color(0xFFEFF0DE), Color(0xFFF5EEDD), Color(0xFFE4F3E6)), listOf(Color(0xFF212210), Color(0xFF26200F), Color(0xFF162519)), mapOf("tsukiyo" to listOf(Color(0xFF222312), Color(0xFF272110), Color(0xFF17261A)), "kokuban" to listOf(Color(0xFF282918), Color(0xFF2D2716), Color(0xFF1D2C20)))),
  )
}
