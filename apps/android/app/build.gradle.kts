plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
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
  implementation(libs.activity.compose)
}
