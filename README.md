# Pixel Blur Controller

KernelSU module + ZygiskNext native module for Android 16 Pixel UI.

## Goal

Disable Pixel UI background blur selectively, without LSPosed/Xposed and without modifying SystemUI or Pixel Launcher APKs.

Development target:

- Google Pixel 8 Pro
- Android 16 / SDK 36
- Build CP1A.260505.005.A1
- Pixel Launcher 16

## Confirmed reverse-engineering results

Pixel Launcher:

com.android.quickstep.util.BaseDepthControllerImpl.applyDepthAndBlur(SurfaceTransaction, boolean, boolean)

reads mCurrentBlur and passes it to SurfaceTransaction$SurfaceProperties.setBackgroundBlurRadius(int), while the existing early-wakeup and transaction scheduling continue.

SystemUI:

com.android.systemui.statusbar.BlurUtils.applyBlur(ViewRootImpl, int, float)

uses withBackgroundBlurRadius(int), withBackgroundBlurScale(float), and the existing early-wakeup path.

SurfaceFlinger observations on the development device:

- NotificationShade: backgroundBlurRadius=102
- NexusLauncherActivity / Recents: backgroundBlurRadius=90

## Implementation

- KernelSU provides the module, configuration, WebUI and diagnostics.
- ZygiskNext provides native process injection and inlineHook.
- No LSPosed/Xposed.
- No APK modification.
- No global blur change is performed at boot.

zn_modules.txt injects the same arm64 native library only into:

- com.android.systemui
- com.google.android.apps.nexuslauncher

The native interception target is:

android::SurfaceComposerClient::Transaction::setBackgroundBlurRadius(const sp<SurfaceControl>&, int)

The hook filters SurfaceControl names:

- SystemUI: NotificationShade
- Launcher: NexusLauncherActivity

Other surfaces are left untouched.

## Controls

- Global Blur: settings global disable_window_blurs
- SystemUI Blur: persist.sys.pixelblur.systemui
- Launcher / Recents Blur: persist.sys.pixelblur.launcher
- Debug logging: persist.sys.pixelblur.debug

Controls default to enabled. After changing a component setting, recreate its relevant surface state to produce a new transaction.

## Build

GitHub Actions builds an arm64 module ZIP with Android NDK and uploads it as a workflow artifact.

Local build:

    ./build.sh

The build script downloads the current public ZygiskNext API header from the upstream project at build time. The header is not stored in this repository.

## Safety

The native code fails open if the target library, symbols, or inline hook cannot be installed.

This is an experimental, device-specific build. The native symbol and ABI assumptions must be validated on the target Pixel build before treating the module as production-safe.
