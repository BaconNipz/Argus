plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val releaseSigningReady = listOf(
    "ARGUS_KEYSTORE_FILE",
    "ARGUS_KEYSTORE_PASSWORD",
    "ARGUS_KEY_ALIAS",
    "ARGUS_KEY_PASSWORD"
).all { !System.getenv(it).isNullOrBlank() }

android {
    namespace = "com.argus.localcore"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.argus.localcore"
        minSdk = 28
        targetSdk = 35
        versionCode = 8
        versionName = "0.7.0"
    }

    signingConfigs {
        if (releaseSigningReady) {
            create("argusRelease") {
                storeFile = file(System.getenv("ARGUS_KEYSTORE_FILE"))
                storePassword = System.getenv("ARGUS_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ARGUS_KEY_ALIAS")
                keyPassword = System.getenv("ARGUS_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            isDebuggable = true
        }

        release {
            isMinifyEnabled = false
            if (releaseSigningReady) {
                signingConfig = signingConfigs.getByName("argusRelease")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.work:work-runtime-ktx:2.10.1")
    testImplementation("junit:junit:4.13.2")
}

kotlin {
    jvmToolchain(17)
}
