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
      val vectors = rootProject.layout.projectDirectory.dir("../../spec/vectors")
      test.inputs.dir(vectors).withPropertyName("vectors").withPathSensitivity(PathSensitivity.RELATIVE)
      test.systemProperty("pochical.vectors", vectors.asFile.path)
    }
  }
}

dependencies {
  api(project(":proto"))
  implementation(project(":design"))

  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.serialization.json)
}

kotlin {
  jvmToolchain(libs.versions.jvm.get().toInt())
}
