plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.kotlin.serialization)
  alias(libs.plugins.metro)
}

// The version people see is the iOS app's: one MARKETING_VERSION for the
// app and its widgets. Each store's build number comes from its own CI.
val marketingVersion =
  providers
    .fileContents(rootProject.layout.projectDirectory.file("../ios/Pochical/Pochical.xcodeproj/project.pbxproj"))
    .asText
    .map { pbxproj ->
      Regex("""MARKETING_VERSION = ([^;]+);""")
        .findAll(pbxproj)
        .map { it.groupValues[1] }
        .toSet()
        .singleOrNull() ?: error("The iOS targets' MARKETING_VERSION must be one version")
    }

// Credential Manager asks Google for ID tokens for the Web client, the
// audience the server checks (spec/sync-protocol.md, Signing in): the first
// of the server's GOOGLE_CLIENT_IDS. Google knows the app itself by its
// Android OAuth clients, its package and signing certificates', in the same
// Google Cloud project, which the app never names.
val googleWebClientId =
  providers
    .fileContents(rootProject.layout.projectDirectory.file("../server/wrangler.jsonc"))
    .asText
    .map { wrangler ->
      Regex(""""GOOGLE_CLIENT_IDS":\s*\[\s*"([^"]+)"""").find(wrangler)?.groupValues?.get(1)
        ?: error("The server's GOOGLE_CLIENT_IDS must name the Web client first")
    }

android {
  namespace = "app.pochical"
  compileSdk = libs.versions.compileSdk.get().toInt()
  defaultConfig {
    applicationId = "app.pochical"
    minSdk = libs.versions.minSdk.get().toInt()
    targetSdk = libs.versions.compileSdk.get().toInt()
    versionCode = providers.gradleProperty("pochicalVersionCode").orElse("1").get().toInt()
    versionName = marketingVersion.get()
    buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"${googleWebClientId.get()}\"")
  }
  buildFeatures {
    buildConfig = true
  }
  signingConfigs {
    // Play's upload key never enters the repository: CI passes it as
    // ORG_GRADLE_PROJECT_* variables, a computer in ~/.gradle/gradle.properties.
    if (providers.gradleProperty("pochicalUploadStoreFile").isPresent) {
      create("upload") {
        storeFile = file(providers.gradleProperty("pochicalUploadStoreFile").get())
        storePassword = providers.gradleProperty("pochicalUploadStorePassword").get()
        keyAlias = providers.gradleProperty("pochicalUploadKeyAlias").get()
        keyPassword = providers.gradleProperty("pochicalUploadKeyPassword").get()
      }
    }
  }
  buildTypes {
    release {
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      // Without the upload key, the debug key signs, so the minified build
      // installs on any computer. Play refuses that bundle: it accepts
      // only the upload key it was given.
      signingConfig = signingConfigs.findByName("upload") ?: signingConfigs.getByName("debug")
    }
  }
  testOptions {
    unitTests.isIncludeAndroidResources = true
    // Robolectric sets up Android 16's shared memory through the JDK's
    // SharedSecrets, which java.base keeps to itself unless exported.
    unitTests.all { it.jvmArgs("--add-exports=java.base/jdk.internal.access=ALL-UNNAMED") }  }
}

dependencies {
  implementation(project(":design"))
  implementation(project(":kit"))
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
  implementation(libs.splashscreen)
  implementation(libs.lifecycle.runtime.compose)
  implementation(libs.credentials)
  implementation(libs.credentials.play.services.auth)
  implementation(libs.googleid)
  implementation(libs.browser)
  implementation(libs.emojipicker)
  implementation(libs.zxing.core)
  implementation(libs.camerax.camera2)
  implementation(libs.camerax.lifecycle)
  implementation(libs.camerax.view)
  implementation(libs.camerax.mlkit)
  implementation(libs.mlkit.barcode)
  implementation(libs.kotlinx.coroutines.play.services)

  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)
  testImplementation(libs.robolectric)
  testImplementation(libs.compose.ui.test.junit4)
  debugImplementation(libs.compose.ui.test.manifest)
}

kotlin {
  jvmToolchain(libs.versions.jvm.get().toInt())
}
