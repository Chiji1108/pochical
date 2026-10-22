plugins {
  alias(libs.plugins.android.library)
  alias(libs.plugins.kotlin.compose)
}

android {
  namespace = "app.pochical.design"
  compileSdk = 37
  defaultConfig {
    minSdk = 29
  }
}

dependencies {
  api(platform(libs.compose.bom))
  api(libs.compose.ui)
  api(libs.compose.animation.core)
}
