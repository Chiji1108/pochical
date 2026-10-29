plugins {
  alias(libs.plugins.android.application) apply false
  alias(libs.plugins.android.library) apply false
  alias(libs.plugins.android.test) apply false
  alias(libs.plugins.baselineprofile) apply false
  alias(libs.plugins.kotlin.jvm) apply false
  alias(libs.plugins.kotlin.compose) apply false
  alias(libs.plugins.kotlin.serialization) apply false
  alias(libs.plugins.metro) apply false
  alias(libs.plugins.ksp) apply false
  alias(libs.plugins.room) apply false
  alias(libs.plugins.google.services) apply false
}

// What every module's unit tests run with.
subprojects {
  tasks.withType<Test>().configureEach {
    // The cases every platform checks its own code against, read where the repository keeps them
    // (the tests' `vectors`); a changed case runs the tests again.
    jvmArgumentProviders += VectorsDirectory(rootDir.resolve("../../spec/vectors"))
    // Robolectric sets up Android 16's shared memory through the JDK's SharedSecrets, which
    // java.base keeps to itself unless exported.
    jvmArgs("--add-exports=java.base/jdk.internal.access=ALL-UNNAMED")
    // A test failing on CI says what it expected and where, not the assertion's class alone.
    testLogging.exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
  }
}

/**
 * spec/vectors for the tests, an input tracked by what it holds rather than where the checkout is,
 * so test results are shared between checkouts.
 */
class VectorsDirectory(
  @get:InputDirectory @get:PathSensitive(PathSensitivity.RELATIVE) val directory: File,
) : CommandLineArgumentProvider {
  override fun asArguments() = listOf("-Dpochical.vectors=${directory.path}")
}
