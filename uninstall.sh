#!/system/bin/sh
MODDIR=$(dirname "$0")
[ -x "$MODDIR/global_blur.sh" ] || chmod 0755 "$MODDIR/global_blur.sh"
"$MODDIR/global_blur.sh" restore
result=$?
if [ "$result" -ne 0 ]; then echo "Pixel Blur Controller: 自动恢复失败；记录如存在保留在 /data/adb/pixelblur-controller/global-blur.original" >&2; fi
exit "$result"
