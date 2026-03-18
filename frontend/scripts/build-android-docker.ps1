param(
    [ValidateSet("release-apk", "release-aab", "debug-apk")]
    [string]$Target = "release-apk",
    [switch]$SkipInstall,
    [switch]$PullLatest,
    [string]$Platform = "linux/amd64"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
if (-not (Test-Path (Join-Path $projectDir "package.json"))) {
    throw "package.json not found. Run this script from the frontend project."
}

function Resolve-DockerCommand {
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerCmd) {
        return $dockerCmd.Source
    }

    $dockerDesktopPath = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
    if (Test-Path $dockerDesktopPath) {
        return $dockerDesktopPath
    }

    throw @"
Docker CLI not found.
Install Docker Desktop and ensure docker.exe is available in PATH.
"@
}

$image = "reactnativecommunity/react-native-android:latest"
$dockerExe = Resolve-DockerCommand

& $dockerExe info *> $null
if ($LASTEXITCODE -ne 0) {
    throw @"
Docker is installed but the daemon is not running.
Start Docker Desktop, wait until it is ready, then run this command again.
"@
}

switch ($Target) {
    "release-apk" { $gradleTask = "assembleRelease" }
    "release-aab" { $gradleTask = "bundleRelease" }
    "debug-apk" { $gradleTask = "assembleDebug" }
}

if ($PullLatest) {
    Write-Host "Pulling latest build image: $image" -ForegroundColor Cyan
    & $dockerExe pull $image
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to pull Docker image $image"
    }
}

$installCmd = if ($SkipInstall) { "echo 'Skipping npm install'" } else { "if [ -f package-lock.json ]; then npm ci; else npm install; fi" }
$containerCmd = "$installCmd && cd android && ./gradlew $gradleTask"

Write-Host "Starting Dockerized Android build: $Target" -ForegroundColor Cyan
Write-Host "Using container platform: $Platform" -ForegroundColor Cyan
Write-Host "This uses isolated toolchains and persistent caches for faster repeat builds." -ForegroundColor Cyan

$projectDirUnix = $projectDir -replace '\\', '/'
if ($projectDirUnix -match '^[A-Za-z]:/') {
    $drive = $projectDirUnix.Substring(0, 1).ToLower()
    $projectDirUnix = "/$drive" + $projectDirUnix.Substring(2)
}

$dockerArgs = @(
    "run", "--rm", "-t",
    "--platform", $Platform,
    "-v", "${projectDirUnix}:/workspace",
    "-v", "dietapp_frontend_node_modules:/workspace/node_modules",
    "-v", "dietapp_frontend_gradle:/home/node/.gradle",
    "-v", "dietapp_frontend_npm:/home/node/.npm",
    "-w", "/workspace",
    $image,
    "bash", "-lc", $containerCmd
)

& $dockerExe @dockerArgs
if ($LASTEXITCODE -ne 0) {
    throw "Dockerized Android build failed with exit code $LASTEXITCODE"
}

switch ($Target) {
    "release-apk" { $artifact = Join-Path $projectDir "android/app/build/outputs/apk/release/app-release.apk" }
    "release-aab" { $artifact = Join-Path $projectDir "android/app/build/outputs/bundle/release/app-release.aab" }
    "debug-apk" { $artifact = Join-Path $projectDir "android/app/build/outputs/apk/debug/app-debug.apk" }
}

if (Test-Path $artifact) {
    Write-Host "Build completed successfully." -ForegroundColor Green
    Write-Host "Artifact: $artifact" -ForegroundColor Green
}
else {
    Write-Host "Build completed, but artifact was not found at expected path:" -ForegroundColor Yellow
    Write-Host $artifact -ForegroundColor Yellow
}
