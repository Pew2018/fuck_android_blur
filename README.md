# Pixel Blur Controller

KernelSU module + standard Zygisk native module for controlling Android 16 Pixel UI Blur on supported Pixel devices.

## Current release: v0.2.0

v0.2.0 is the first stable release of the new native interception architecture and the redesigned WebUI.

The native side uses the standard Zygisk app-process module interface and directly hooks:

`android/view/SurfaceControl.nativeSetBackgroundBlurRadius(JJI)V`

Only these two target processes are handled:

- `com.android.systemui`
- `com.google.android.apps.nexuslauncher`

Runtime validation confirmed independent control of SystemUI blur and Launcher / Recents blur on the development device.

## Features

### Common controls

The WebUI puts the two most frequently used controls first:

- **Native Hook** — master switch for native interception. OFF by default; changing it requires a reboot.
- **Global Blur** — controls Android's global `disable_window_blurs` setting.

### Other Blur controls

Less frequently used controls are grouped into a separate expandable card:

- **SystemUI Blur** — Notification Shade / Quick Settings.
- **Launcher / Recents Blur** — Pixel Launcher / Recents.

These component switches are used by the native hook when **Native Hook** is enabled.

### WebUI theme

The WebUI supports both automatic and manual theme control:

- **Auto-follow system theme** detects the phone's current dark/light mode when the WebUI opens.
- While automatic mode is enabled, the WebUI periodically re-checks the system theme and also re-checks it when returning to the foreground.
- **Dark mode** can be controlled manually when automatic following is disabled.
- The selected manual theme preference is stored locally in the WebUI.

The visual design remains a simple Android 8-era Pixel / Material style rather than Material 3.

## WebUI implementation

The WebUI uses KernelSU Next's bridge:

`window.ksu.exec(command, callbackFunctionName)`

The callback form is used so the WebUI receives complete stdout, stderr, and exit status instead of only the last stdout line.

The WebUI validates property writes by reading the value back after each change.

## Native safety model

- Native interception is OFF by default.
- No LSPosed/Xposed is required.
- No APK patching is used.
- The hook changes only the blur-radius argument before forwarding to the original JNI implementation.
- The native code targets only SystemUI and Pixel Launcher.
- If the native hook cannot be installed, the module fails open and preserves the original behavior.

## Build

GitHub Actions builds an arm64-v8a KernelSU ZIP with the Android NDK.

The module author is **Pew2018**.

## Compatibility

The project targets Android 16 Pixel UI and is intended for supported Pixel devices using a compatible Zygisk implementation and KernelSU.

Because the native hook depends on Android framework implementation details, compatibility outside the validated environment is not guaranteed.
