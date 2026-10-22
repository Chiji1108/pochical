plugins {
  alias(libs.plugins.kotlin.jvm)
}

dependencies {
  api(libs.protobuf.javalite)
  api(libs.protobuf.kotlin.lite)
  api(libs.connect.kotlin)
  api(libs.connect.kotlin.google.javalite.ext)
}
