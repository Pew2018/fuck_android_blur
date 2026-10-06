#!/system/bin/sh

# Native interception is enabled by default; an explicit 0 remains a user opt-out.
[ -n "$(/system/bin/getprop persist.sys.pixelblur.hook)" ] ||
    /system/bin/setprop persist.sys.pixelblur.hook 1

[ -n "$(getprop persist.sys.pixelblur.systemui)" ] ||
    setprop persist.sys.pixelblur.systemui 1

[ -n "$(getprop persist.sys.pixelblur.launcher)" ] ||
    setprop persist.sys.pixelblur.launcher 1

[ -n "$(getprop persist.sys.pixelblur.debug)" ] ||
    setprop persist.sys.pixelblur.debug 0
