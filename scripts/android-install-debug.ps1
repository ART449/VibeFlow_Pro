param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-AdbPath {
    $repoRoot = Get-RepoRoot
    $candidates = @(
        (Join-Path $repoRoot ".android-sdk\platform-tools\adb.exe"),
        (Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"),
        (Join-Path $env:ANDROID_SDK_ROOT "platform-tools\adb.exe"),
        (Join-Path $env:ANDROID_HOME "platform-tools\adb.exe")
    ) | Where-Object { $_ }

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return (Resolve-Path $candidate).Path
        }
    }

    return $null
}

$repoRoot = Get-RepoRoot
$apkPath = Join-Path $repoRoot "android\app\build\outputs\apk\debug\app-debug.apk"
$adbPath = Get-AdbPath

if (-not $adbPath) {
    throw "adb.exe not found. Install Android platform-tools first."
}

if (-not $SkipBuild -or -not (Test-Path $apkPath)) {
    Push-Location $repoRoot
    try {
        npm.cmd run android:apk:debug
    }
    finally {
        Pop-Location
    }
}

if (-not (Test-Path $apkPath)) {
    throw "Debug APK not found at $apkPath"
}

$deviceLines = & $adbPath devices | Select-Object -Skip 1 | Where-Object { $_ -match "\sdevice$" }
if (-not $deviceLines -or $deviceLines.Count -eq 0) {
    throw "No Android devices detected. Connect a phone or start an emulator first."
}

$serial = ($deviceLines[0] -split "\s+")[0]
Write-Host "Installing on device: $serial"
& $adbPath -s $serial install -r $apkPath

Write-Host ""
Write-Host "Installed APK:"
Write-Host $apkPath
