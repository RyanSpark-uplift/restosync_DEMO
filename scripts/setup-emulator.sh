#!/usr/bin/env bash
# RestoSync — provision an Android emulator on macOS (Apple Silicon) and run the
# tablet release APK on it. One-time SDK component install + AVD creation.
#
# Prereq (installed via brew separately):
#   brew install openjdk@17 android-commandlinetools android-platform-tools
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── SDK / JDK env ─────────────────────────────────────────────────────────────
export ANDROID_HOME="${ANDROID_HOME:-$(brew --prefix)/share/android-commandlinetools}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

API="34"
IMAGE="system-images;android-${API};google_apis;arm64-v8a"
AVD_NAME="RestoSync_Tablet"
TABLET_APK="$REPO_ROOT/apps/tablet/android/app/build/outputs/apk/release/app-release.apk"

echo "ANDROID_HOME=$ANDROID_HOME"
echo "JAVA_HOME=$JAVA_HOME"
command -v sdkmanager >/dev/null || { echo "sdkmanager not found under $ANDROID_HOME/cmdline-tools/latest/bin"; exit 1; }

# ── 1) Accept licenses + install components ──────────────────────────────────
echo "[1/4] accepting licenses + installing SDK components (emulator, platform, system image)..."
yes | sdkmanager --licenses >/dev/null 2>&1 || true
sdkmanager "platform-tools" "emulator" "platforms;android-${API}" "$IMAGE"

# ── 2) Create AVD (tablet-ish profile) ───────────────────────────────────────
if avdmanager list avd 2>/dev/null | grep -q "Name: ${AVD_NAME}"; then
  echo "[2/4] AVD '${AVD_NAME}' already exists — reusing"
else
  echo "[2/4] creating AVD '${AVD_NAME}'..."
  echo "no" | avdmanager create avd -n "$AVD_NAME" -k "$IMAGE" -d "pixel_tablet" 2>/dev/null \
    || echo "no" | avdmanager create avd -n "$AVD_NAME" -k "$IMAGE"
fi

# ── 3) Boot emulator (background) + wait for boot ────────────────────────────
if adb devices | grep -q emulator; then
  echo "[3/4] an emulator is already running — reusing"
else
  echo "[3/4] booting emulator (background)..."
  nohup emulator -avd "$AVD_NAME" -netdelay none -netspeed full -no-snapshot-save \
    > "$REPO_ROOT/.dev-logs/emulator.log" 2>&1 &
fi
echo "  waiting for device + boot_completed (up to 120s)..."
adb wait-for-device
for _ in $(seq 1 120); do
  [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && { echo "  ✓ booted"; break; }
  sleep 2
done

# ── 4) reverse API port + install + launch tablet ────────────────────────────
echo "[4/4] adb reverse :3000, install + launch tablet..."
adb reverse tcp:3000 tcp:3000 || true
adb install -r -d "$TABLET_APK"
adb shell monkey -p com.restosync.tablet -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 \
  || adb shell am start -n com.restosync.tablet/.MainActivity >/dev/null 2>&1

cat <<EOF

------------------------------------------------------------
Tablet emulator up.  In the app SetupScreen / API field enter:
    http://localhost:3000     (reverse-tunneled to the Mac API)
Login:  license RS-TEST-0001-AAAA   ·   PIN 1234
------------------------------------------------------------
EOF
