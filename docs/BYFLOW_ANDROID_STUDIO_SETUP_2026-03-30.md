# ByFlow Android Studio Setup

This wrapper APK is ready at project level, but the local machine still needs the Android SDK.

## Current status

- Android Studio is installed.
- The bundled Java runtime is available at `C:\Program Files\Android\Android Studio\jbr`.
- The Android SDK was not detected yet on `March 30, 2026`.

## One-time setup in Android Studio

1. Open Android Studio.
2. Go to `More Actions` -> `SDK Manager`.
3. Install these components:
   - `Android SDK Platform 36`
   - `Android SDK Build-Tools`
   - `Android SDK Platform-Tools`
   - `Android SDK Command-line Tools`
4. Let Android Studio finish downloading everything.

## Build commands

From the repo root:

```powershell
npm run android:doctor
npm run android:apk:debug
```

What the script does:

- detects the Android Studio Java runtime
- detects the Android SDK
- writes `android/local.properties`
- runs `npx cap sync android`
- builds `android/app/build/outputs/apk/debug/app-debug.apk`

## Output

Expected APK path:

`C:\BYFLOW\VibeFlow_Pro\android\app\build\outputs\apk\debug\app-debug.apk`

## Notes

- The backend stays exactly as it is.
- This APK is the wrapper version that points to the live ByFlow web app.
- Native screens can continue being built later in parallel.
