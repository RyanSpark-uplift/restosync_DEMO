#!/usr/bin/env bash
# RestoSync — install + launch the release APKs on physical devices (macOS).
# Mac port of start-onn-test.bat. Release APKs embed JS (no Metro needed);
# only the API port (3000) is reverse-tunneled so the device can reach the Mac.
#
# Usage:
#   scripts/test-devices.sh tv  <onn-ip>        # install/launch TV on Onn 4K (network adb)
#   scripts/test-devices.sh tablet <ip|usb>     # install/launch tablet (network ip or "usb")
#   scripts/test-devices.sh both <onn-ip> <tablet-ip|usb>
#
# Prereq on each Android/Google-TV device (one time):
#   Settings > System > About > tap "Build" 7x  -> Developer options on
#   Developer options > enable "USB debugging" + "Wireless/Network debugging"
#   Device must be on the SAME Wi-Fi/LAN as this Mac.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ADB="$(command -v adb)"; : "${ADB:?adb not found — brew install android-platform-tools}"
PORT=5555
TV_APK="apps/tv/android/app/build/outputs/apk/release/app-release.apk"
TABLET_APK="apps/tablet/android/app/build/outputs/apk/release/app-release.apk"

connect() {  # $1 = ip ; echoes the resolved serial, returns nonzero on failure
  local ip="$1" serial="$1:$PORT" st=""
  for _ in $(seq 1 12); do
    "$ADB" connect "$serial" >/dev/null 2>&1
    st="$("$ADB" -s "$serial" get-state 2>/dev/null || true)"
    [ "$st" = "device" ] && { echo "$serial"; return 0; }
    [ "$st" = "unauthorized" ] && echo "  > approve the 'Allow debugging?' prompt ON THE DEVICE screen..." >&2
    sleep 3
  done
  echo "  ! could not connect $serial (last state: '$st')" >&2
  return 1
}

deploy() {  # $1 = serial ; $2 = apk ; $3 = package ; $4 = launch component
  local serial="$1" apk="$2" pkg="$3" comp="$4"
  echo "  [reverse] $serial localhost:3000 -> Mac:3000"
  "$ADB" -s "$serial" reverse tcp:3000 tcp:3000 >/dev/null 2>&1 \
    || echo "    (reverse failed — use Mac LAN IP http://192.168.1.x:3000 in the app instead)"
  echo "  [install] $apk -> $serial  (-r reinstall, -d downgrade ok)"
  "$ADB" -s "$serial" install -r -d "$apk" 2>&1 | tail -2
  echo "  [launch] $pkg"
  "$ADB" -s "$serial" shell monkey -p "$pkg" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 \
    || "$ADB" -s "$serial" shell am start -n "$comp" >/dev/null 2>&1
}

do_tv() {
  local ip="$1"; echo "=== TV (Onn 4K) @ $ip ==="
  [ -f "$TV_APK" ] || { echo "  ! TV APK missing: $TV_APK"; return 1; }
  local serial; serial="$(connect "$ip")" || return 1
  echo "  connected: $serial  ($("$ADB" -s "$serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r'))"
  deploy "$serial" "$TV_APK" com.restosync.tv "com.restosync.tv/.MainActivity"
}

do_tablet() {
  local target="$1"; echo "=== Tablet @ $target ==="
  [ -f "$TABLET_APK" ] || { echo "  ! Tablet APK missing: $TABLET_APK"; return 1; }
  local serial
  if [ "$target" = "usb" ]; then
    serial="$("$ADB" devices | awk 'NR>1 && $2=="device" && $1 !~ /:/ {print $1; exit}')"
    [ -n "$serial" ] || { echo "  ! no USB device. Plug in + authorize, then: adb devices"; return 1; }
  else
    serial="$(connect "$target")" || return 1
  fi
  echo "  connected: $serial  ($("$ADB" -s "$serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r'))"
  deploy "$serial" "$TABLET_APK" com.restosync.tablet "com.restosync.tablet/.MainActivity"
}

cmd="${1:-}"
case "$cmd" in
  tv)     do_tv "${2:?Usage: test-devices.sh tv <onn-ip>}" ;;
  tablet) do_tablet "${2:?Usage: test-devices.sh tablet <ip|usb>}" ;;
  both)   do_tv "${2:?need onn-ip}"; echo; do_tablet "${3:?need tablet ip|usb}" ;;
  *) echo "Usage: $0 {tv <onn-ip> | tablet <ip|usb> | both <onn-ip> <tablet-ip|usb>}"; exit 1 ;;
esac

cat <<EOF

------------------------------------------------------------
Backend : http://localhost:3000  (API)   |  Mac LAN: http://192.168.1.133:3000
Login   : license RS-TEST-0001-AAAA  ·  PIN 1234
In-app API URL field: http://localhost:3000  (works via adb reverse)
                  or: http://192.168.1.133:3000  (works over Wi-Fi)
------------------------------------------------------------
EOF
