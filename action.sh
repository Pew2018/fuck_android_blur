#!/system/bin/sh
printf '%s\n' 'Pixel Blur Controller diagnostics'
printf 'SystemUI enabled: %s\n' "$(getprop persist.sys.pixelblur.systemui)"
printf 'Launcher enabled: %s\n' "$(getprop persist.sys.pixelblur.launcher)"
printf 'Debug logging: %s\n' "$(getprop persist.sys.pixelblur.debug)"
printf 'Global disable_window_blurs: %s\n' "$(settings get global disable_window_blurs)"
printf '\nTarget process injection:\n'
for p in com.android.systemui com.google.android.apps.nexuslauncher; do
  pid="$(pidof "$p" 2>/dev/null | awk '{print $1}')"
  if [ -n "$pid" ]; then
    printf '%s pid=%s\n' "$p" "$pid"
    grep -F '/pixelblur-controller/' "/proc/$pid/maps" 2>/dev/null || true
  else
    printf '%s not running\n' "$p"
  fi
done
printf '\nHook log:\n'
logcat -d -t 100 -s PixelBlur:I PixelBlur:E 2>/dev/null || true
