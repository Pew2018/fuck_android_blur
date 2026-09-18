#!/system/bin/sh
printf '%s\\n' 'Pixel Blur Controller diagnostics'
printf 'Native hook (next boot): %s\\n' "$(getprop persist.sys.pixelblur.hook)"
printf 'SystemUI enabled: %s\\n' "$(getprop persist.sys.pixelblur.systemui)"
printf 'SystemUI intensity: %s%%\\n' "$(getprop persist.sys.pixelblur.systemui.intensity)"
printf 'Launcher enabled: %s\\n' "$(getprop persist.sys.pixelblur.launcher)"
printf 'Launcher intensity: %s%%\\n' "$(getprop persist.sys.pixelblur.launcher.intensity)"
printf 'Debug logging: %s\\n' "$(getprop persist.sys.pixelblur.debug)"
printf 'Global disable_window_blurs: %s\\n' "$(settings get global disable_window_blurs)"

printf '\\nTarget processes:\\n'
for p in com.android.systemui com.google.android.apps.nexuslauncher; do
  pid="$(pidof "$p" 2>/dev/null | awk '{print $1}')"
  if [ -n "$pid" ]; then
    printf '%s pid=%s\\n' "$p" "$pid"
    grep -E 'arm64-v8a\\.so|libpixelblur\\.so' "/proc/$pid/maps" 2>/dev/null | head -n 2 || true
  else
    printf '%s not running\\n' "$p"
  fi
done

printf '\\nHook log:\\n'
logcat -d -t 120 -s PixelBlur:I PixelBlur:E 2>/dev/null || true
