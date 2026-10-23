plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.kotlin.serialization)
  alias(libs.plugins.metro)
}

android {
  namespace = "app.pochical"
  compileSdk = libs.versions.compileSdk.get().toInt()
  defaultConfig {
    applicationId = "app.pochical"
    minSdk = libs.versions.minSdk.get().toInt()
    targetSdk = libs.versions.compileSdk.get().toInt()
    versionCode = 1
    versionName = "1.0"
  }
}

dependencies {
  implementation(project(":design"))
  implementation(project(":proto"))
  implementation(platform(libs.compose.bom))
  implementation(libs.compose.material3)
  implementation(libs.compose.material3.navigation.suite)
  implementation(libs.activity.compose)
  implementation(libs.navigation3.runtime)
  implementation(libs.navigation3.ui)
  implementation(libs.metrox.android)
  implementation(libs.kotlinx.serialization.json)
  implementation(libs.datastore)
  implementation(libs.lifecycle.runtime.compose)

  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)
}

kotlin {
  jvmToolchain(libs.versions.jvm.get().toInt())
}
