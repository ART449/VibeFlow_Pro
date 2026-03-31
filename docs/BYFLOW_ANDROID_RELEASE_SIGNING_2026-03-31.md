# ByFlow Android Release Signing

ByFlow can already generate:

- debug APK for local testing
- unsigned release APK for QA and packaging review

## Current command

```powershell
npm.cmd run android:apk:release
```

## Expected output

`C:\BYFLOW\VibeFlow_Pro\android\app\build\outputs\apk\release\app-release-unsigned.apk`

## What is still missing for a store-ready build

1. A production keystore
2. Signing credentials outside version control
3. `signingConfigs.release` wired into `android/app/build.gradle`
4. Optionally, a signed AAB for Play Console

## Practical recommendation

- Keep using the debug APK for local installs right now
- Use the unsigned release APK to validate performance and packaging
- Add production signing when the first native POS flows are already stable
