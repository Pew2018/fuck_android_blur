# Pixel Blur Controller

KernelSU module + ZygiskNext native module for controlling Android 16 Pixel UI Blur.

## v0.1.1

v0.1.1 is the first runtime-validated release on the development Pixel 8 Pro.

The WebUI is compatible with KernelSU Next and uses its callback-based `exec()` interface for complete command output and exit-code handling. The four controls can read their real current state and write their settings from the WebUI.

The UI design is intentionally kept in a simple Android 8-era Pixel / Material style and is not dependent on Material 3.

## Controls

- **Native Hook** — opt-in master switch, default OFF. Changing it requires a reboot before the ZygiskNext interception is active.
- **Global Blur** — controls Android's global `disable_window_blurs` setting.
- **SystemUI Blur** — controls Notification Shade / Quick Settings interception when Native Hook is enabled.
- **Launcher / Recents Blur** — controls Pixel Launcher / Recents interception when Native Hook is enabled.
- **Debug** — enables optional PixelBlur log output.

The component switches are only used by the native interception when **Native Hook** is enabled.

## Native architecture

The native interception is **disabled by default**.

When enabled, the module injects only into:

- `com.android.systemui`
- `com.google.android.apps.nexuslauncher`

It installs a PLT hook in `libandroid_runtime.so` for:

`android::SurfaceComposerClient::Transaction::setBackgroundBlurRadius(const sp<SurfaceControl>&, int)`

The hook changes only the blur-radius argument. It does not inline-hook `libgui.so`, call `SurfaceControl::getName()`, modify the SystemUI or Launcher APKs, or replace the original transaction scheduling.

If the PLT hook cannot be installed, the native library fails open and leaves the original behavior intact.

## Development / validation target

- Google Pixel 8 Pro
- Android 16 / SDK 36
- Build `CP1A.260505.005.A1`
- Pixel Launcher 16
- KernelSU Next / `ksud 3.3.0` (uapi 2)

Observed SurfaceFlinger blur radii on the development device:

- Notification Shade: `backgroundBlurRadius=102`
- Pixel Launcher / Recents: `backgroundBlurRadius=90`

v0.1.1 was runtime-tested on the development device. WebUI state reading and setting changes were verified, including the Native Hook switch surviving a reboot.

## WebUI

The WebUI is implemented for KernelSU Next's bridge:

`window.ksu.exec(command, callbackFunctionName)`

The single-argument KernelSU Next `exec()` path only exposes the last stdout line through `ShellUtils.fastCmd()`, so v0.1.1 deliberately uses the callback overload to receive full stdout, stderr, and exit status.

This makes state parsing and write verification deterministic while keeping the UI unchanged.

## Build

GitHub Actions builds an arm64-v8a KernelSU ZIP with Android NDK.

The repository's build workflow is the authoritative way to reproduce the module package.

## Safety notes

- Native Hook defaults to OFF.
- No LSPosed/Xposed is required.
- No APK patching is used.
- The native interception targets only the two Pixel UI processes above.
- The module is still device/build-specific experimental software outside the validated development environment.
