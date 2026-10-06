#!/system/bin/sh
log_lines() { logcat -d -v brief -s PixelBlur:I PixelBlur:E 2>/dev/null; }
proc_start_ticks() { awk '{print $22}' "/proc/$1/stat" 2>/dev/null; }
current_hook_state() {
  process=$1; pid=$2; ticks=$3
  [ -n "$pid" ] || { echo not_running; return; }
  [ -n "$ticks" ] || { echo unknown; return; }
  lines=$(log_lines | grep -E "PixelBlur\\([[:space:]]*$pid\\):" | grep -F "process_start_ticks=$ticks" 2>/dev/null)
  if echo "$lines" | grep -F "process=$process action=hook_installed" >/dev/null 2>&1; then echo installed
  elif echo "$lines" | grep -E "process=$process action=hook_(install_failed|skipped)" >/dev/null 2>&1; then echo not_installed
  else echo unknown; fi
}
systemui_pid=$(pidof com.android.systemui 2>/dev/null | awk '{print $1}')
launcher_pid=$(pidof com.google.android.apps.nexuslauncher 2>/dev/null | awk '{print $1}')
systemui_ticks=$(proc_start_ticks "$systemui_pid")
launcher_ticks=$(proc_start_ticks "$launcher_pid")
if [ "$1" = status ]; then
  printf 'systemui.pid=%s\nsystemui.start_ticks=%s\nsystemui.hook=%s\n' "$systemui_pid" "$systemui_ticks" "$(current_hook_state com.android.systemui "$systemui_pid" "$systemui_ticks")"
  printf 'launcher.pid=%s\nlauncher.start_ticks=%s\nlauncher.hook=%s\n' "$launcher_pid" "$launcher_ticks" "$(current_hook_state com.google.android.apps.nexuslauncher "$launcher_pid" "$launcher_ticks")"
  exit 0
fi
echo 'Pixel Blur Controller diagnostics'
printf 'Hook config: %s\nSystemUI config: %s\nLauncher config: %s\n' "$(getprop persist.sys.pixelblur.hook)" "$(getprop persist.sys.pixelblur.systemui)" "$(getprop persist.sys.pixelblur.launcher)"
printf 'disable_window_blurs: %s\n' "$(settings get global disable_window_blurs 2>&1)"
printf 'wm disable-blur capability and current state:\n'; wm disable-blur 2>&1 || true
echo
for process in com.android.systemui com.google.android.apps.nexuslauncher; do
  if [ "$process" = com.android.systemui ]; then pid=$systemui_pid; ticks=$systemui_ticks; else pid=$launcher_pid; ticks=$launcher_ticks; fi
  if [ -n "$pid" ]; then
    printf '%s pid=%s start_ticks=%s hook=%s\n' "$process" "$pid" "$ticks" "$(current_hook_state "$process" "$pid" "$ticks")"
    if [ -r "/proc/$pid/maps" ]; then
      maps=$(grep -E 'zygisk/arm64-v8a\.so|pixelblur|zygisk' "/proc/$pid/maps" 2>/dev/null | head -n 3)
      if [ -n "$maps" ]; then printf '  candidate mappings (supporting evidence only):\n%s\n' "$maps"; else echo '  no identifiable mapping (not conclusive)'; fi
    else echo '  maps=unavailable'; fi
  else printf '%s not_running\n' "$process"; fi
done
echo 'SurfaceFlinger background blur evidence (radius alone does not prove Hook behavior):'
dumpsys SurfaceFlinger 2>/dev/null | grep -A 10 -B 2 -E 'NotificationShade#[0-9]+|NexusLauncherActivity#[0-9]+' | grep -E 'Layer |backgroundBlurRadius=' | head -n 12 || true
echo 'Current-process PixelBlur log evidence:'
logs=$(log_lines)
for process in com.android.systemui com.google.android.apps.nexuslauncher; do
  if [ "$process" = com.android.systemui ]; then pid=$systemui_pid; ticks=$systemui_ticks; else pid=$launcher_pid; ticks=$launcher_ticks; fi
  [ -n "$pid" ] || continue
  echo "$logs" | grep -E "PixelBlur\\([[:space:]]*$pid\\):" | grep -F "process_start_ticks=$ticks" | tail -n 8 || true
done
echo 'Scope: Hook changes positive radii passed through SurfaceControl.nativeSetBackgroundBlurRadius in SystemUI and Pixel Launcher only. It does not cover all RenderEffect, region blur, noise/grain, or other background effects.'
