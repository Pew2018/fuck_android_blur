#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
ANDROID_NDK_HOME="$(printenv ANDROID_NDK_HOME || true)"
if [[ -z "$ANDROID_NDK_HOME" ]]; then ANDROID_NDK_HOME="$(printenv ANDROID_NDK_ROOT || true)"; fi
if [[ -z "$ANDROID_NDK_HOME" ]]; then
  SDK="$(printenv ANDROID_SDK_ROOT || true)"
  if [[ -z "$SDK" ]]; then SDK="$(printenv ANDROID_HOME || true)"; fi
  if [[ -z "$SDK" ]]; then SDK="$HOME/Library/Android/sdk"; fi
  if [[ -d "$SDK/ndk" ]]; then ANDROID_NDK_HOME="$(ls -dt "$SDK"/ndk/* 2>/dev/null | head -n 1 || true)"; fi
fi
if [[ -z "$ANDROID_NDK_HOME" || ! -f "$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake" ]]; then echo "Android NDK not found: $ANDROID_NDK_HOME" >&2; exit 1; fi
API_HEADER="$ROOT/third_party/zygisk.hpp"; mkdir -p "$ROOT/third_party"
curl -fsSL https://raw.githubusercontent.com/topjohnwu/zygisk-module-sample/master/module/jni/zygisk.hpp -o "$API_HEADER"
BUILD="$ROOT/.build"; rm -rf "$BUILD"
cmake -S "$ROOT" -B "$BUILD" -G Ninja -DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake" -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-30 -DANDROID_STL=c++_static
cmake --build "$BUILD" --parallel
chmod 0755 "$ROOT/service.sh" "$ROOT/action.sh" "$ROOT/global_blur.sh" "$ROOT/uninstall.sh"
rm -rf "$ROOT/lib" "$ROOT/zygisk"; mkdir -p "$ROOT/zygisk"; cp "$BUILD/libpixelblur.so" "$ROOT/zygisk/arm64-v8a.so"
OUT="$ROOT/pixelblur-controller-install.zip"
rm -f "$ROOT"/pixelblur-controller-*.zip
(cd "$ROOT" && zip -r -9 "$OUT" module.prop service.sh action.sh uninstall.sh global_blur.sh webroot zygisk >/dev/null)
unzip -l "$OUT" | grep -q 'uninstall.sh'; unzip -l "$OUT" | grep -q 'global_blur.sh'; unzip -l "$OUT" | grep -q 'action.sh'
zipinfo -l "$OUT" | awk '$NF == "service.sh" || $NF == "action.sh" || $NF == "uninstall.sh" || $NF == "global_blur.sh" {
  found++;
  if (substr($1,4,1) != "x" || substr($1,7,1) != "x" || substr($1,10,1) != "x") bad=1;
} END { exit (found == 4 && !bad) ? 0 : 1 }' || { echo "Executable permission missing from module scripts" >&2; exit 1; }
echo "Built and checked: $OUT"
