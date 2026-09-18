#!/system/bin/sh

# Safety-first default: native interception is OFF unless explicitly enabled.
[ -n "$(getprop persist.sys.pixelblur.hook)" ] ||
    setprop persist.sys.pixelblur.hook 0

[ -n "$(getprop persist.sys.pixelblur.systemui)" ] ||
    setprop persist.sys.pixelblur.systemui 1

[ -n "$(getprop persist.sys.pixelblur.launcher)" ] ||
    setprop persist.sys.pixelblur.launcher 1

[ -n "$(getprop persist.sys.pixelblur.systemui.intensity)" ] ||
    setprop persist.sys.pixelblur.systemui.intensity 100

[ -n "$(getprop persist.sys.pixelblur.launcher.intensity)" ] ||
    setprop persist.sys.pixelblur.launcher.intensity 100

[ -n "$(getprop persist.sys.pixelblur.debug)" ] ||
    setprop persist.sys.pixelblur.debug 0
