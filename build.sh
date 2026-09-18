#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
: "\${ANDROID_NDK_HOME:=\${ANDROID_NDK_ROOT:-}}"

if [[ -z "\${ANDROID_NDK_HOME}" ]]; then
  SDK="\${ANDROID_SDK_ROOT:-\${ANDROID_HOME:-\$HOME/Library/Android/sdk}}"
  if [[ -d "\$SDK/ndk" ]]; then
    ANDROID_NDK_HOME="\$(ls -dt "\$SDK"/ndk/* 2>/dev/null | head -n 1 || true)"
  fi
fi

if [[ -z "\${ANDROID_NDK_HOME:-}" ||
      ! -x "\${ANDROID_NDK_HOME}/build/cmake/android.toolchain.cmake" ]]; then
  echo "Android NDK not found." >&2
  exit 1
fi

API_HEADER="\$ROOT/third_party/zygisk_next_api.h"
mkdir -p "\$ROOT/third_party"

# Pin the exact public API header used by the upstream sample.
curl -fsSL \
  https://raw.githubusercontent.com/5ec1cff/ZygiskNextModuleSample/3dd921bef650086685eac64c75bd833a1c766ad3/native/zygisk_next_api.h \
  -o "\$API_HEADER"

BUILD="\$ROOT/.build"
rm -rf "\$BUILD"

cmake -S "\$ROOT" -B "\$BUILD" \
  -G Ninja \
  -DCMAKE_TOOLCHAIN_FILE="\$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI=arm64-v8a \
  -DANDROID_PLATFORM=android-30 \
  -DANDROID_STL=c++_static

cmake --build "\$BUILD" --parallel

rm -rf "\$ROOT/lib"
mkdir -p "\$ROOT/lib/arm64-v8a"
cp "\$BUILD/libpixelblur.so" "\$ROOT/lib/arm64-v8a/libpixelblur.so"

OUT="\$ROOT/../pixelblur-controller-\$(date +%Y%m%d-%H%M%S).zip"
rm -f "\$OUT"

(
  cd "\$ROOT"
  zip -r -9 "\$OUT" \
    module.prop \
    zn_modules.txt \
    service.sh \
    action.sh \
    webroot \
    lib >/dev/null
)

echo "Built: \$OUT"
