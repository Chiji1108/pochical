plugins {
  alias(libs.plugins.android.library)
  alias(libs.plugins.kotlin.compose)
}

android {
  namespace = "app.pochical.design"
  compileSdk = libs.versions.compileSdk.get().toInt()
  defaultConfig {
    minSdk = libs.versions.minSdk.get().toInt()
  }
}

dependencies {
  api(platform(libs.compose.bom))
  api(libs.compose.ui)
  api(libs.compose.animation.core)
}
