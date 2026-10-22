plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
}

android {
  namespace = "app.pochical"
  compileSdk = 37
  defaultConfig {
    applicationId = "app.pochical"
    minSdk = 29
    targetSdk = 37
    versionCode = 1
    versionName = "0.1.0"
  }
}

dependencies {
  implementation(project(":design"))
  implementation(project(":proto"))
  implementation(platform(libs.compose.bom))
  implementation(libs.compose.material3)
  implementation(libs.activity.compose)
}
