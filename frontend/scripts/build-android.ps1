param(
    [ValidateSet("release-apk", "release-aab", "debug-apk")]
    [string]$Target = "release-apk",
    [switch]$SkipInstall,
    [switch]$Clean,
    [switch]$UseCi
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$androidDir = Join-Path $projectDir "android"
$gradleWrapper = Join-Path $androidDir "gradlew.bat"

function Invoke-ExternalCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$Description = $FilePath
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed with exit code $LASTEXITCODE"
    }
}

function Ensure-JavaEnvironment {
    if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
        return
    }

    $javaCmd = Get-Command java -ErrorAction SilentlyContinue
    if (-not $javaCmd) {
        throw @"
JAVA_HOME is not set and java was not found in PATH.
Install JDK 17+ and set JAVA_HOME, for example:
  setx JAVA_HOME \"C:\\Program Files\\Eclipse Adoptium\\jdk-17.x.x\"
Then restart your terminal and run the build again.
"@
    }

    $javaExe = $javaCmd.Source
    $javaBinDir = Split-Path -Parent $javaExe
    $detectedJavaHome = Split-Path -Parent $javaBinDir
    if (Test-Path (Join-Path $detectedJavaHome "bin\java.exe")) {
        $env:JAVA_HOME = $detectedJavaHome
        Write-Host "Detected JAVA_HOME: $env:JAVA_HOME" -ForegroundColor Cyan
    }
    else {
        throw "Unable to resolve JAVA_HOME from java in PATH. Set JAVA_HOME manually and retry."
    }

    $javaVersionOutput = & $javaExe -version 2>&1
    $versionText = ($javaVersionOutput | Out-String)
    $major = $null

    if ($versionText -match 'version\s+"(?<major>\d+)') {
        $major = [int]$Matches['major']
    }
    elseif ($versionText -match 'openjdk\s+(?<major>\d+)') {
        $major = [int]$Matches['major']
    }

    if (-not $major) {
        Write-Host "Could not parse Java version. Continuing with detected JAVA_HOME." -ForegroundColor Yellow
        return
    }

    if ($major -lt 17) {
        throw @"
Detected Java $major, but Android build requires Java 17 or higher.
Install JDK 17 or JDK 21 and set JAVA_HOME to that installation.
"@
    }

    if ($major -gt 21) {
        throw @"
Detected Java $major at $env:JAVA_HOME, which is too new for this Android Gradle plugin setup.
Use JDK 17 or JDK 21 instead.

Example (PowerShell):
  setx JAVA_HOME "C:\Program Files\Java\jdk-21"
  setx PATH "%PATH%;C:\Program Files\Java\jdk-21\bin"

Then open a new terminal and run: npm run android:build:fast
"@
    }
}

function Ensure-AndroidSdk {
    $localPropertiesPath = Join-Path $androidDir "local.properties"

    $sdkPath = $null
    if ($env:ANDROID_SDK_ROOT -and (Test-Path $env:ANDROID_SDK_ROOT)) {
        $sdkPath = $env:ANDROID_SDK_ROOT
    }
    elseif ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) {
        $sdkPath = $env:ANDROID_HOME
    }
    else {
        $candidate = Join-Path $env:LOCALAPPDATA "Android\Sdk"
        if (Test-Path $candidate) {
            $sdkPath = $candidate
        }
    }

    if (-not $sdkPath) {
        throw @"
Android SDK not found.

Install Android Studio:
  winget install --id Google.AndroidStudio -e

Then open Android Studio once and install SDK + build tools from SDK Manager.
"@
    }

    $env:ANDROID_HOME = $sdkPath
    $env:ANDROID_SDK_ROOT = $sdkPath

    $escapedSdk = $sdkPath -replace '\\', '\\\\'
    $content = "sdk.dir=$escapedSdk`r`n"
    Set-Content -Path $localPropertiesPath -Value $content -Encoding ASCII
}

if (-not (Test-Path (Join-Path $projectDir "package.json"))) {
    throw "package.json not found. Run this script from the frontend project."
}

if (-not (Test-Path $gradleWrapper)) {
    throw "Android Gradle wrapper not found at $gradleWrapper"
}

switch ($Target) {
    "release-apk" {
        $gradleTask = "assembleRelease"
        $artifactRelPath = "app/build/outputs/apk/release/app-release.apk"
    }
    "release-aab" {
        $gradleTask = "bundleRelease"
        $artifactRelPath = "app/build/outputs/bundle/release/app-release.aab"
    }
    "debug-apk" {
        $gradleTask = "assembleDebug"
        $artifactRelPath = "app/build/outputs/apk/debug/app-debug.apk"
    }
}

Push-Location $projectDir
try {
    if (-not $SkipInstall) {
        $hasLockfile = Test-Path "package-lock.json"
        $hasNodeModules = Test-Path "node_modules"

        if ($UseCi -or ($hasLockfile -and -not $hasNodeModules)) {
            Write-Host "Installing JS dependencies with npm ci..." -ForegroundColor Cyan
            Invoke-ExternalCommand -FilePath "npm" -Arguments @("ci") -Description "npm ci"
        }
        else {
            Write-Host "Installing JS dependencies with npm install..." -ForegroundColor Cyan
            Invoke-ExternalCommand -FilePath "npm" -Arguments @("install") -Description "npm install"
        }
    }

    Ensure-JavaEnvironment
    Ensure-AndroidSdk

    Push-Location $androidDir
    try {
        if ($Clean) {
            Write-Host "Running Gradle clean..." -ForegroundColor Cyan
            Invoke-ExternalCommand -FilePath ".\gradlew.bat" -Arguments @("clean") -Description "Gradle clean"
        }

        Write-Host "Compiling Android app with Gradle task: $gradleTask" -ForegroundColor Cyan
        Invoke-ExternalCommand -FilePath ".\gradlew.bat" -Arguments @($gradleTask) -Description "Gradle $gradleTask"

        $artifactPath = Join-Path $androidDir $artifactRelPath
        if (Test-Path $artifactPath) {
            Write-Host "Build completed successfully." -ForegroundColor Green
            Write-Host "Artifact: $artifactPath" -ForegroundColor Green
        }
        else {
            throw "Build finished but artifact was not found at expected path: $artifactPath"
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    Pop-Location
}
