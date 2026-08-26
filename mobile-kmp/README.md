# Plexive mobile (Kotlin Multiplatform)

The Plexive mobile app. The UI is Compose Multiplatform shared by Android and iOS, navigation is
Navigation 3, and dependency injection is Koin via its compiler plugin. The app talks to the Plexive
FastAPI backend over Ktor, never to Supabase directly.

## Layout

- `shared/` - everything shared. `commonMain` holds the UI, view models, repositories and the HTTP
  client; `androidMain` and `iosMain` hold only the platform halves of `expect`/`actual` pairs
  (currently token storage: Android Keystore, iOS Keychain).
- `androidApp/` - the Android application module: manifest, launcher resources, `MainActivity`.
- `iosApp/` - the Xcode project that hosts the shared UI.

## Building and running on Android

`mobile-kmp/` is a standalone Gradle build with its own wrapper and its own `settings.gradle.kts`.
There is no root `settings.gradle`, so run from this directory. `:mobile-kmp:assembleDebug` does not
exist as a task.

`ANDROID_HOME` is not set on this machine, so export it per invocation rather than creating a
`local.properties`:

```
export ANDROID_HOME='C:\Users\<you>\AppData\Local\Android\Sdk'
./gradlew :androidApp:assembleDebug
```

The APK lands in `androidApp/build/outputs/apk/debug/`. Install it with
`adb install -r <apk>`.

The build cache makes a re-run report every task `UP-TO-DATE` or `FROM-CACHE` even after `clean`, so
a green build proves nothing about whether the code compiles. When the point is to verify a compile,
add `--no-build-cache`.

## Backend address

The backend address is a build-time setting, not a source constant: the `plexive.api.baseUrl` Gradle
property is written into `commonMain` by the `generateApiConfig` task. The committed default is in
`gradle.properties`. Do not put a local address there. Override it for your machine in
`~/.gradle/gradle.properties`, or for one build:

```
./gradlew :androidApp:assembleDebug -Pplexive.api.baseUrl=http://10.0.2.2:8000
```

`10.0.2.2` is how an Android emulator reaches the host. A release build refuses anything that is not
https.

## iOS

iOS cannot be built here: this project has no Mac. `iosMain` type-checks on Windows via
`./gradlew :shared:compileIosMainKotlinMetadata`, but the shared code has never been linked into a
framework, and the app has never run on a device or a simulator. Treat everything iOS-specific as
unverified until someone builds it from Xcode on a Mac.
