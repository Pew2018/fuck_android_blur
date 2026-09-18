#!/system/bin/sh

# Persistent settings are stored in KernelSU Module Config.
# service.sh restores them into Android properties for the native library.
MODULE_ID="pixelblur-controller"

config_get() {
    ksud module config get "$1" 2>/dev/null
}

read_or_init() {
    key="$1"
    default="$2"
    value="$(config_get "$key")"
    case "$value" in
        0|1) printf '%s' "$value" ;;
        *)
            ksud module config set "$key" "$default" >/dev/null 2>&1 || true
            printf '%s' "$default"
            ;;
    esac
}

hook="$(read_or_init hook 0)"
systemui="$(read_or_init systemui 1)"
launcher="$(read_or_init launcher 1)"
debug="$(read_or_init debug 0)"

setprop persist.sys.pixelblur.hook "$hook"
setprop persist.sys.pixelblur.systemui "$systemui"
setprop persist.sys.pixelblur.launcher "$launcher"
setprop persist.sys.pixelblur.debug "$debug"
