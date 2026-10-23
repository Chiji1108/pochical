plugins {
  alias(libs.plugins.android.library)
  alias(libs.plugins.kotlin.serialization)
}

android {
  namespace = "app.pochical.kit"
  compileSdk = libs.versions.compileSdk.get().toInt()
  defaultConfig {
    minSdk = libs.versions.minSdk.get().toInt()
  }
  testOptions {
    unitTests.all { test ->
      // The cases every platform checks its own code against, read where
      // the repository keeps them; a changed case runs the tests again.
      test.jvmArgumentProviders += VectorsDirectory(rootProject.file("../../spec/vectors"))
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

dependencies {
  api(project(":proto"))

  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.serialization.json)
}

kotlin {
  jvmToolchain(libs.versions.jvm.get().toInt())
}
