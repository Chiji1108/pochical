plugins {
  alias(libs.plugins.android.library)
}

// Walking the app on a device by the words on its screens, through UI Automator: what
// :baselineprofile's journeys and :app's store screenshots both do.
android {
  namespace = "app.pochical.walk"
  compileSdk = libs.versions.compileSdk.get().toInt()
  defaultConfig {
    minSdk = libs.versions.minSdk.get().toInt()
  }
}

dependencies {
  api(libs.uiautomator)
}

kotlin {
  jvmToolchain(libs.versions.jvm.get().toInt())
}
