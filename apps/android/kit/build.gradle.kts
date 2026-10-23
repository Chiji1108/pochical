plugins {
  alias(libs.plugins.android.library)
  alias(libs.plugins.kotlin.serialization)
  alias(libs.plugins.ksp)
  alias(libs.plugins.room)
}

android {
  namespace = "app.pochical.kit"
  compileSdk = libs.versions.compileSdk.get().toInt()
  defaultConfig {
    minSdk = libs.versions.minSdk.get().toInt()
  }
  testOptions {
    unitTests.isIncludeAndroidResources = true
    unitTests.all { test ->
      // The cases every platform checks its own code against, read where
      // the repository keeps them; a changed case runs the tests again.
      test.jvmArgumentProviders += VectorsDirectory(rootProject.file("../../spec/vectors"))
      // Robolectric sets up Android 16's shared memory through the JDK's
      // SharedSecrets, which java.base keeps to itself unless exported.
      test.jvmArgs("--add-exports=java.base/jdk.internal.access=ALL-UNNAMED")
    }
  }
}

/**
 * spec/vectors for the tests, an input tracked by what it holds rather than
 * where the checkout is, so test results are shared between checkouts.
 */
class VectorsDirectory(
  @get:InputDirectory @get:PathSensitive(PathSensitivity.RELATIVE) val directory: File,
) : CommandLineArgumentProvider {
  override fun asArguments() = listOf("-Dpochical.vectors=${directory.path}")
}

// The schema each database version had, written as Room builds it: CI
// fails when building changes one already there, which a shape changed
// without its version raised does (AppDatabase).
room3 {
  schemaDirectory("$projectDir/schemas")
}

dependencies {
  api(project(":proto"))
  implementation(project(":design"))
  api(libs.room.runtime)
  ksp(libs.room.compiler)

  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.serialization.json)
  testImplementation(libs.kotlinx.coroutines.test)
  testImplementation(libs.robolectric)
}

kotlin {
  jvmToolchain(libs.versions.jvm.get().toInt())
}
