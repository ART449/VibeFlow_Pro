param(
    [switch]$DoctorOnly,
    [switch]$SkipCapSync,
    [ValidateSet("debug", "release")]
    [string]$BuildType = "debug",
    [ValidateSet("remote", "bundled")]
    [string]$AppMode = "remote"
)

$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-AndroidStudioJavaHome {
    $candidates = @(
        "C:\Program Files\Android\Android Studio\jbr",
        "C:\Program Files\Android\Android Studio\jre"
    )

    foreach ($candidate in $candidates) {
        $javaExe = Join-Path $candidate "bin\java.exe"
        if (Test-Path $javaExe) {
            return $candidate
        }
    }

    return $null
}

function Get-AndroidSdkPath {
    $repoLocalSdk = Join-Path (Get-RepoRoot) '.android-sdk'
    $candidates = @(
        $repoLocalSdk,
        $env:ANDROID_SDK_ROOT,
        $env:ANDROID_HOME,
        (Join-Path $env:LOCALAPPDATA "Android\Sdk"),
        (Join-Path $env:USERPROFILE "AppData\Local\Android\Sdk")
    ) | Where-Object { $_ }

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return (Resolve-Path $candidate).Path
        }
    }

    return $null
}

function Get-GradleExecutable {
    $gradleRoot = Join-Path $env:USERPROFILE ".gradle\wrapper\dists\gradle-8.14.3-all"
    if (-not (Test-Path $gradleRoot)) {
        return $null
    }

    $gradleExe = Get-ChildItem -Path $gradleRoot -Recurse -Filter "gradle.bat" -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName

    if ($gradleExe -and (Test-Path $gradleExe)) {
        return $gradleExe
    }

    return $null
}

function Write-LocalProperties {
    param(
        [Parameter(Mandatory = $true)]
        [string]$AndroidDir,
        [Parameter(Mandatory = $true)]
        [string]$SdkPath
    )

    $escaped = $SdkPath -replace "\\", "\\\\"
    $content = "sdk.dir=$escaped`r`n"
    Set-Content -LiteralPath (Join-Path $AndroidDir "local.properties") -Value $content -Encoding ASCII
}

function Set-AndroidAssetMode {
    param(
        [Parameter(Mandatory = $true)]
        [string]$AndroidDir,
        [Parameter(Mandatory = $true)]
        [string]$AppMode
    )

    $assetConfigPath = Join-Path $AndroidDir "app\src\main\assets\capacitor.config.json"
    if (-not (Test-Path $assetConfigPath)) {
        return
    }

    $assetConfig = Get-Content $assetConfigPath -Raw | ConvertFrom-Json
    $hasServer = [bool]$assetConfig.server

    if ($AppMode -eq "bundled" -and $hasServer) {
        $assetConfig.PSObject.Properties.Remove("server")
        $assetConfig | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $assetConfigPath -Encoding UTF8
        Write-Host "Android asset config set to bundled local mode."
        return
    }

    if ($AppMode -eq "remote" -and $hasServer) {
        Write-Host "Android asset config left in remote wrapper mode."
    }
}

$repoRoot = Get-RepoRoot
$androidDir = Join-Path $repoRoot "android"
$javaHome = Get-AndroidStudioJavaHome
$sdkPath = Get-AndroidSdkPath
$gradleHome = Join-Path $repoRoot ".gradle-android"
$gradleExe = Get-GradleExecutable
$projectCacheDir = Join-Path $androidDir ".gradle-build-cache"

Write-Host "ByFlow Android doctor"
Write-Host "Repo: $repoRoot"
Write-Host "Android dir: $androidDir"
Write-Host "Android Studio JBR: $(if ($javaHome) { $javaHome } else { 'NOT FOUND' })"
Write-Host "Android SDK: $(if ($sdkPath) { $sdkPath } else { 'NOT FOUND' })"
Write-Host "Gradle executable: $(if ($gradleExe) { $gradleExe } else { 'WRAPPER' })"
Write-Host "App mode: $AppMode"
Write-Host "Project cache dir: $projectCacheDir"

if (-not $javaHome) {
    throw "Android Studio Java runtime not found. Verify Android Studio is installed in C:\Program Files\Android\Android Studio."
}

if (-not $sdkPath) {
    Write-Host ""
    Write-Host "Android SDK is not installed yet."
    Write-Host "Open Android Studio > More Actions > SDK Manager and install:"
    Write-Host "  - Android SDK Platform 36"
    Write-Host "  - Android SDK Build-Tools"
    Write-Host "  - Android SDK Platform-Tools"
    Write-Host "  - Android SDK Command-line Tools"
    exit 1
}

Write-LocalProperties -AndroidDir $androidDir -SdkPath $sdkPath
Write-Host "local.properties updated."

if ($DoctorOnly) {
    exit 0
}

$env:JAVA_HOME = $javaHome
$env:ANDROID_SDK_ROOT = $sdkPath
$env:ANDROID_HOME = $sdkPath
$env:GRADLE_USER_HOME = $gradleHome

Push-Location $repoRoot
try {
    if (-not $SkipCapSync) {
        Write-Host "Running Capacitor sync..."
        npm.cmd run cap:sync:android
        $syncExit = $LASTEXITCODE
        if ($syncExit -ne 0) {
            $capConfigPath = Join-Path $repoRoot "capacitor.config.json"
            $hasRemoteServer = $false
            if (Test-Path $capConfigPath) {
                $capConfig = Get-Content $capConfigPath -Raw | ConvertFrom-Json
                $hasRemoteServer = [bool]$capConfig.server.url
            }

            if ($hasRemoteServer) {
                Write-Warning "Capacitor sync failed, but continuing because the Android wrapper loads a remote server.url."
            } else {
                throw "Capacitor sync failed with exit code $syncExit"
            }
        }
    }

    Set-AndroidAssetMode -AndroidDir $androidDir -AppMode $AppMode
}
finally {
    Pop-Location
}

Push-Location $androidDir
try {
    $gradleTask = if ($BuildType -eq "release") { "assembleRelease" } else { "assembleDebug" }
    Write-Host "Building $BuildType APK..."
    if ($gradleExe) {
        & $gradleExe -p $androidDir --no-daemon --project-cache-dir $projectCacheDir $gradleTask
    } else {
        & ".\gradlew.bat" --no-daemon --project-cache-dir $projectCacheDir $gradleTask
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle build failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$apkCandidates = if ($BuildType -eq "release") {
    @(
        (Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"),
        (Join-Path $androidDir "app\build\outputs\apk\release\app-release-unsigned.apk")
    )
} else {
    @(
        (Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk")
    )
}

$apkPath = $apkCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $apkPath) {
    throw "Build finished without generating an expected $BuildType APK"
}

Write-Host ""
Write-Host "APK ready:"
Write-Host $apkPath
