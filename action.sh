#!/system/bin/sh
printf '%s\n' 'Pixel Blur Controller diagnostics'

printf 'Persistent config:\n'
printf 'Native hook: %s\n' "$(ksud module config get hook 2>/dev/null || true)"
printf 'SystemUI: %s\n' "$(ksud module config get systemui 2>/dev/null || true)"
printf 'Launcher: %s\n' "$(ksud module config get launcher 2>/dev/null || true)"
printf 'Debug: %s\n' "$(ksud module config get debug 2>/dev/null || true)"

printf '\nRuntime properties:\n'
printf 'Native hook property: %s\n' "$(getprop persist.sys.pixelblur.hook)"
printf 'SystemUI property: %s\n' "$(getprop persist.sys.pixelblur.systemui)"
printf 'Launcher property: %s\n' "$(getprop persist.sys.pixelblur.launcher)"
printf 'Debug property: %s\n' "$(getprop persist.sys.pixelblur.debug)"
printf 'Global disable_window_blurs: %s\n' "$(settings get global disable_window_blurs)"

printf '\nTarget processes:\n'
for p in com.android.systemui com.google.android.apps.nexuslauncher; do
  pid="$(pidof "$p" 2>/dev/null | awk '{print $1}')"
  if [ -n "$pid" ]; then
    printf '%s pid=%s\n' "$p" "$pid"
    grep -F 'libpixelblur.so' "/proc/$pid/maps" 2>/dev/null | head -n 2 || true
  else
    printf '%s not running\n' "$p"
  fi
done

printf '\nHook log:\n'
logcat -d -t 120 -s PixelBlur:I PixelBlur:E 2>/dev/null || true
