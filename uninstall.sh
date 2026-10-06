#!/system/bin/sh
MODDIR=$(dirname "$0")
STATE_DIR=/data/adb/pixelblur-controller
[ -x "$MODDIR/global_blur.sh" ] || chmod 0755 "$MODDIR/global_blur.sh"
"$MODDIR/global_blur.sh" restore
result=$?
if [ "$result" -eq 0 ]; then
  rm -f "$STATE_DIR/global-blur.original" "$STATE_DIR"/.global-blur.original.*
  rmdir "$STATE_DIR" 2>/dev/null || true
else
  echo "Pixel Blur Controller: 自动恢复失败；记录如存在保留在 /data/adb/pixelblur-controller/global-blur.original" >&2
fi
exit "$result"
