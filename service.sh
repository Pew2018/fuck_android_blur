#!/system/bin/sh

# Native interception is enabled by default; an explicit 0 remains a user opt-out.
[ -n "$(/system/bin/getprop persist.sys.pixelblur.hook)" ] ||
    /system/bin/setprop persist.sys.pixelblur.hook 1

[ -n "$(/system/bin/getprop persist.sys.pixelblur.systemui)" ] ||
    /system/bin/setprop persist.sys.pixelblur.systemui 1

[ -n "$(/system/bin/getprop persist.sys.pixelblur.launcher)" ] ||
    /system/bin/setprop persist.sys.pixelblur.launcher 1

[ -n "$(/system/bin/getprop persist.sys.pixelblur.debug)" ] ||
    /system/bin/setprop persist.sys.pixelblur.debug 0
