#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-release-apk}"
SKIP_INSTALL="${SKIP_INSTALL:-0}"
PULL_LATEST="${PULL_LATEST:-0}"
ARCH="$(uname -m)"

if [ -n "${PLATFORM:-}" ]; then
  EFFECTIVE_PLATFORM="$PLATFORM"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  EFFECTIVE_PLATFORM="linux/arm64"
else
  EFFECTIVE_PLATFORM="linux/amd64"
fi

if [ -n "${IMAGE:-}" ]; then
  EFFECTIVE_IMAGE="$IMAGE"
elif [ "$EFFECTIVE_PLATFORM" = "linux/arm64" ]; then
  # reactnativecommunity/react-native-android is amd64-only; use multi-arch image on ARM hosts.
  EFFECTIVE_IMAGE="ghcr.io/cirruslabs/android-sdk:35"
else
  EFFECTIVE_IMAGE="reactnativecommunity/react-native-android:latest"
fi

case "$TARGET" in
  release-apk) GRADLE_TASK="assembleRelease"; ARTIFACT="android/app/build/outputs/apk/release/app-release.apk" ;;
  release-aab) GRADLE_TASK="bundleRelease"; ARTIFACT="android/app/build/outputs/bundle/release/app-release.aab" ;;
  debug-apk) GRADLE_TASK="assembleDebug"; ARTIFACT="android/app/build/outputs/apk/debug/app-debug.apk" ;;
  *)
    echo "[ERROR] Invalid target: $TARGET"
    echo "Use one of: release-apk | release-aab | debug-apk"
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -f "$PROJECT_DIR/package.json" ]; then
  echo "[ERROR] package.json not found. Run from frontend project."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker CLI not found. Install Docker first."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[ERROR] Docker daemon is not running. Start Docker and retry."
  exit 1
fi

if [ "$PULL_LATEST" = "1" ]; then
  echo "Pulling latest build image: $EFFECTIVE_IMAGE"
  docker pull --platform "$EFFECTIVE_PLATFORM" "$EFFECTIVE_IMAGE"
fi

INSTALL_CMD="if [ -f package-lock.json ]; then npm ci; else npm install; fi"
if [ "$SKIP_INSTALL" = "1" ]; then
  INSTALL_CMD="echo 'Skipping npm install'"
fi

CONTAINER_CMD="$INSTALL_CMD && cd android && ./gradlew $GRADLE_TASK"

echo "Starting Dockerized Android build: $TARGET"
echo "Detected host architecture: $ARCH"
echo "Using container platform: $EFFECTIVE_PLATFORM"
echo "Using container image: $EFFECTIVE_IMAGE"
echo "Using persistent Docker volumes for npm and Gradle cache."

docker run --rm -t \
  --platform "$EFFECTIVE_PLATFORM" \
  -v "$PROJECT_DIR:/workspace" \
  -v dietapp_frontend_node_modules:/workspace/node_modules \
  -v dietapp_frontend_gradle:/home/node/.gradle \
  -v dietapp_frontend_npm:/home/node/.npm \
  -w /workspace \
  "$EFFECTIVE_IMAGE" \
  bash -lc "$CONTAINER_CMD"

if [ -f "$PROJECT_DIR/$ARTIFACT" ]; then
  echo "Build completed successfully."
  echo "Artifact: $PROJECT_DIR/$ARTIFACT"
else
  echo "Build completed, but artifact was not found at expected path:"
  echo "$PROJECT_DIR/$ARTIFACT"
fi
