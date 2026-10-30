plugins {
  alias(libs.plugins.android.test)
  alias(libs.plugins.baselineprofile)
}

// The journeys that generate the app's Baseline Profile, and the benchmarks that measure what it
// gains, run on a device against the release build the plugin makes for each (AGENTS.md, Android).
android {
  namespace = "app.pochical.baselineprofile"
  compileSdk = libs.versions.compileSdk.get().toInt()
  defaultConfig {
    minSdk = libs.versions.minSdk.get().toInt()
    targetSdk = libs.versions.compileSdk.get().toInt()
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }
  targetProjectPath = ":app"
}

baselineProfile {
  // The emulator or phone adb has, never one Gradle makes: CI generates nothing.
  useConnectedDevices = true
}

dependencies {
  implementation(libs.androidx.test.junit)
  implementation(libs.uiautomator)
  implementation(libs.benchmark.macro.junit4)
}

kotlin {
  jvmToolchain(libs.versions.jvm.get().toInt())
}
