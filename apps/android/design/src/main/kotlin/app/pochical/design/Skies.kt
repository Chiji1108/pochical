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
    "asayake" to SkyLights(listOf(Color(0xFFFEEADD), Color(0xFFDDF2FF), Color(0xFFF1EBFE)), listOf(Color(0xFF492E1B), Color(0xFF18394B), Color(0xFF392F4B)), mapOf("tsukiyo" to listOf(Color(0xFF361D0A), Color(0xFF052739), Color(0xFF281E39)), "kokuban" to listOf(Color(0xFF4F3320), Color(0xFF1E3F51), Color(0xFF3E3451)))),
    "hakumei" to SkyLights(listOf(Color(0xFFEEECFE), Color(0xFFE3F0FE), Color(0xFFFEE8E9)), listOf(Color(0xFF35314D), Color(0xFF21374E), Color(0xFF4C2A2D)), mapOf("tsukiyo" to listOf(Color(0xFF241F3A), Color(0xFF0F253B), Color(0xFF39191C)), "kokuban" to listOf(Color(0xFF3A3653), Color(0xFF263C54), Color(0xFF512F32)))),
    "koori" to SkyLights(listOf(Color(0xFFD3F6FF), Color(0xFFEBEDFF), Color(0xFFD3F8EF)), listOf(Color(0xFF0F3C45), Color(0xFF30324F), Color(0xFF113E36)), mapOf("tsukiyo" to listOf(Color(0xFF002932), Color(0xFF1F213C), Color(0xFF012B25)), "kokuban" to listOf(Color(0xFF15414B), Color(0xFF353854), Color(0xFF17433B)))),
    "mikan" to SkyLights(listOf(Color(0xFFFFEBD2), Color(0xFFF4F0D1), Color(0xFFFFE8EC)), listOf(Color(0xFF443116), Color(0xFF3B3615), Color(0xFF4B2A32)), mapOf("tsukiyo" to listOf(Color(0xFF322004), Color(0xFF2A2403), Color(0xFF381921)), "kokuban" to listOf(Color(0xFF4A371B), Color(0xFF413B1B), Color(0xFF512F37)))),
    "momo" to SkyLights(listOf(Color(0xFFFEE8EB), Color(0xFFFEEBD9), Color(0xFFFAE7FF)), listOf(Color(0xFF4B2A2F), Color(0xFF473018), Color(0xFF412D45)), mapOf("tsukiyo" to listOf(Color(0xFF38191E), Color(0xFF341E06), Color(0xFF2F1C33)), "kokuban" to listOf(Color(0xFF512F34), Color(0xFF4D351D), Color(0xFF46324B)))),
    "ramune" to SkyLights(listOf(Color(0xFFD7F8E8), Color(0xFFF2F1D2), Color(0xFFD3F6FF)), listOf(Color(0xFF193D2F), Color(0xFF393716), Color(0xFF0F3C45)), mapOf("tsukiyo" to listOf(Color(0xFF052B1E), Color(0xFF282504), Color(0xFF002932)), "kokuban" to listOf(Color(0xFF1E4334), Color(0xFF3E3C1B), Color(0xFF15414B)))),
    "wakakusa" to SkyLights(listOf(Color(0xFFE6F4D9), Color(0xFFF7EFD1), Color(0xFFD1F7F7)), listOf(Color(0xFF2D3B1E), Color(0xFF3D3515), Color(0xFF0C3D3D)), mapOf("tsukiyo" to listOf(Color(0xFF1C290D), Color(0xFF2C2303), Color(0xFF002A2B)), "kokuban" to listOf(Color(0xFF324023), Color(0xFF433A1A), Color(0xFF134343)))),
    "yunagi" to SkyLights(listOf(Color(0xFFFEE9E4), Color(0xFFFEE7F1), Color(0xFFEAEEFE)), listOf(Color(0xFF4C2C24), Color(0xFF492A39), Color(0xFF2E334F)), mapOf("tsukiyo" to listOf(Color(0xFF381A13), Color(0xFF361927), Color(0xFF1D223C)), "kokuban" to listOf(Color(0xFF513129), Color(0xFF4E2F3E), Color(0xFF333855)))),
    "theme-cocoa" to SkyLights(listOf(Color(0xFFFEEAE0), Color(0xFFFCECD7), Color(0xFFFEE8EB)), listOf(Color(0xFF472F24), Color(0xFF42321D), Color(0xFF482D31)), mapOf("tsukiyo" to listOf(Color(0xFF341E13), Color(0xFF2F210C), Color(0xFF351C20)), "kokuban" to listOf(Color(0xFF4C3429), Color(0xFF473822), Color(0xFF4D3236)))),
    "theme-kissa" to SkyLights(listOf(Color(0xFFFEEADB), Color(0xFFFEE9E4), Color(0xFFFBEDD1)), listOf(Color(0xFF482F1A), Color(0xFF4C2C24), Color(0xFF413315)), mapOf("tsukiyo" to listOf(Color(0xFF351E08), Color(0xFF381A13), Color(0xFF2F2203)), "kokuban" to listOf(Color(0xFF4E341F), Color(0xFF513129), Color(0xFF46381A)))),
    "theme-kokuban" to SkyLights(listOf(Color(0xFFDCF6E9), Color(0xFFD7F5FC), Color(0xFFFEE7F3)), listOf(Color(0xFF203C30), Color(0xFF1A3B42), Color(0xFF442D3A)), mapOf("tsukiyo" to listOf(Color(0xFF0E2A1F), Color(0xFF072930), Color(0xFF321C28)), "kokuban" to listOf(Color(0xFF264135), Color(0xFF204048), Color(0xFF4A323F)))),
    "theme-matcha" to SkyLights(listOf(Color(0xFFEBF3D5), Color(0xFFF9EED1), Color(0xFFFEE7F1)), listOf(Color(0xFF32391A), Color(0xFF3F3414), Color(0xFF492A39)), mapOf("tsukiyo" to listOf(Color(0xFF212708), Color(0xFF2D2302), Color(0xFF361927)), "kokuban" to listOf(Color(0xFF373E20), Color(0xFF45391A), Color(0xFF4E2F3E)))),
    "theme-milktea" to SkyLights(listOf(Color(0xFFFEEADD), Color(0xFFFAEDD7), Color(0xFFFEE9E8)), listOf(Color(0xFF463021), Color(0xFF40331D), Color(0xFF482D2D)), mapOf("tsukiyo" to listOf(Color(0xFF331F10), Color(0xFF2E220B), Color(0xFF351C1C)), "kokuban" to listOf(Color(0xFF4B3526), Color(0xFF463822), Color(0xFF4D3232)))),
    "theme-pochical" to SkyLights(listOf(Color(0xFFF4F0D1), Color(0xFFDCF7E1), Color(0xFFD9F4FF)), listOf(Color(0xFF3B3615), Color(0xFF223D27), Color(0xFF133B49)), mapOf("tsukiyo" to listOf(Color(0xFF2A2403), Color(0xFF102B17), Color(0xFF012935)), "kokuban" to listOf(Color(0xFF413B1B), Color(0xFF27422C), Color(0xFF19404E)))),
    "theme-sakura" to SkyLights(listOf(Color(0xFFFEE9E4), Color(0xFFFEE8EF), Color(0xFFF1EBFE)), listOf(Color(0xFF4C2C24), Color(0xFF4A2A37), Color(0xFF392F4B)), mapOf("tsukiyo" to listOf(Color(0xFF381A13), Color(0xFF371925), Color(0xFF281E39)), "kokuban" to listOf(Color(0xFF513129), Color(0xFF4F2F3C), Color(0xFF3E3451)))),
    "theme-soda" to SkyLights(listOf(Color(0xFFD5F8EA), Color(0xFFD3F6FF), Color(0xFFF4F0D1)), listOf(Color(0xFF163E31), Color(0xFF0F3C45), Color(0xFF3B3615)), mapOf("tsukiyo" to listOf(Color(0xFF022C20), Color(0xFF002932), Color(0xFF2A2403)), "kokuban" to listOf(Color(0xFF1C4336), Color(0xFF15414B), Color(0xFF413B1B)))),
    "theme-sumi" to SkyLights(listOf(Color(0xFFE7F0F9), Color(0xFFF3EEE3), Color(0xFFF0ECF8)), listOf(Color(0xFF2E363F), Color(0xFF39352A), Color(0xFF37333E)), mapOf("tsukiyo" to listOf(Color(0xFF1D252D), Color(0xFF282419), Color(0xFF25222C)), "kokuban" to listOf(Color(0xFF333C45), Color(0xFF3E3A2F), Color(0xFF3C3844)))),
    "theme-sumire" to SkyLights(listOf(Color(0xFFF5E9FE), Color(0xFFEBEDFF), Color(0xFFFEE9E8)), listOf(Color(0xFF3D2E49), Color(0xFF30324F), Color(0xFF4C2B2B)), mapOf("tsukiyo" to listOf(Color(0xFF2B1D36), Color(0xFF1F213C), Color(0xFF39191A)), "kokuban" to listOf(Color(0xFF43334E), Color(0xFF353854), Color(0xFF523030)))),
    "theme-tsukiyo" to SkyLights(listOf(Color(0xFFEEECFE), Color(0xFFE3F0FE), Color(0xFFD3F6FF)), listOf(Color(0xFF35314D), Color(0xFF21374E), Color(0xFF0F3C45)), mapOf("tsukiyo" to listOf(Color(0xFF241F3A), Color(0xFF0F253B), Color(0xFF002932)), "kokuban" to listOf(Color(0xFF3A3653), Color(0xFF263C54), Color(0xFF15414B)))),
    "theme-zen" to SkyLights(listOf(Color(0xFFEFF0DE), Color(0xFFF5EEDD), Color(0xFFE4F3E6)), listOf(Color(0xFF363725), Color(0xFF3B3523), Color(0xFF2A3A2D)), mapOf("tsukiyo" to listOf(Color(0xFF252514), Color(0xFF2A2313), Color(0xFF19281C)), "kokuban" to listOf(Color(0xFF3B3C2A), Color(0xFF413A28), Color(0xFF2F3F32)))),
  )
}
