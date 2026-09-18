#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-${ANDROID_NDK_ROOT:-}}"

if [[ -z "$ANDROID_NDK_HOME" ]]; then
  SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
  if [[ -d "$SDK/ndk" ]]; then
    ANDROID_NDK_HOME="$(ls -dt "$SDK"/ndk/* 2>/dev/null | head -n 1 || true)"
  fi
fi

if [[ -z "$ANDROID_NDK_HOME" ||
      ! -f "$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake" ]]; then
  echo "Android NDK not found: $ANDROID_NDK_HOME" >&2
  exit 1
fi

API_HEADER="$ROOT/third_party/zygisk.hpp"
mkdir -p "$ROOT/third_party"

curl -fsSL \
  https://raw.githubusercontent.com/topjohnwu/zygisk-module-sample/master/module/jni/zygisk.hpp \
  -o "$API_HEADER"

BUILD="$ROOT/.build"
rm -rf "$BUILD"

cmake -S "$ROOT" -B "$BUILD" \
  -G Ninja \
  -DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI=arm64-v8a \
  -DANDROID_PLATFORM=android-30 \
  -DANDROID_STL=c++_static

cmake --build "$BUILD" --parallel

chmod +x "$ROOT/service.sh" "$ROOT/action.sh"

rm -rf "$ROOT/lib" "$ROOT/zygisk"
mkdir -p "$ROOT/zygisk"

cp "$BUILD/libpixelblur.so" "$ROOT/zygisk/arm64-v8a.so"

OUT="$ROOT/pixelblur-controller-zygisk-test-$(date +%Y%m%d-%H%M%S).zip"
rm -f "$ROOT"/pixelblur-controller-zygisk-test-*.zip "$OUT"

(
  cd "$ROOT"
  zip -r -9 "$OUT" \
    module.prop \
    service.sh \
    action.sh \
    webroot \
    zygisk \
    >/dev/null
)

echo "Built: $OUT"
