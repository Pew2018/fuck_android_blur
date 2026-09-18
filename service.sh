#!/system/bin/sh
[ -n "$(getprop persist.sys.pixelblur.systemui)" ] || setprop persist.sys.pixelblur.systemui 1
[ -n "$(getprop persist.sys.pixelblur.launcher)" ] || setprop persist.sys.pixelblur.launcher 1
[ -n "$(getprop persist.sys.pixelblur.debug)" ] || setprop persist.sys.pixelblur.debug 0
