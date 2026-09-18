# Pixel Blur Controller

KernelSU module + ZygiskNext native module for Android 16 Pixel UI.

## Safety-first native architecture

The native interception is **disabled by default**.

When enabled, the module does not inline-hook `libgui.so`. It injects into only:

- `com.android.systemui`
- `com.google.android.apps.nexuslauncher`

and installs a PLT hook in `libandroid_runtime.so` for:

`android::SurfaceComposerClient::Transaction::setBackgroundBlurRadius(const sp<SurfaceControl>&, int)`

The hook changes only the radius argument. It does not call `SurfaceControl::getName()`, does not modify SystemUI/Launcher APKs, and does not alter the original transaction scheduling.

## Development target

- Google Pixel 8 Pro
- Android 16 / SDK 36
- Build CP1A.260505.005.A1
- Pixel Launcher 16

Confirmed SurfaceFlinger values on the development device:

- NotificationShade: backgroundBlurRadius=102
- NexusLauncherActivity / Recents: backgroundBlurRadius=90

## Controls

- Native Hook: opt-in master switch, default OFF; reboot required after changing it.
- Global Blur: `settings global disable_window_blurs`
- SystemUI Blur: `persist.sys.pixelblur.systemui`
- Launcher / Recents Blur: `persist.sys.pixelblur.launcher`
- Debug: `persist.sys.pixelblur.debug`

The component switches matter only when Native Hook is enabled.

## Build

GitHub Actions builds an arm64-v8a KernelSU ZIP with Android NDK.

## Important

This is still an experimental native interception module. A successful build does not prove runtime compatibility; the next validation step is boot-safe on-device testing with the master hook initially OFF.
