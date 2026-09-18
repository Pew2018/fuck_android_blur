#include "zygisk_next_api.h"

#include <android/log.h>
#include <fcntl.h>
#include <stdarg.h>
#include <strings.h>
#include <sys/system_properties.h>
#include <unistd.h>

#include <cstring>
#include <string>

namespace {

constexpr const char* kTag = "PixelBlur";
constexpr const char* kLauncherProcess = "com.google.android.apps.nexuslauncher";
constexpr const char* kSystemUiProcess = "com.android.systemui";
constexpr const char* kLibGui = "/system/lib64/libgui.so";

using SetBlurFn =
        void* (*)(void* transaction, const void* surfaceControlSp, int radius);
using GetNameFn = const std::string& (*)(const void* surfaceControl);

static ZygiskNextAPI gApi{};
static SetBlurFn gOriginalSetBlur = nullptr;
static GetNameFn gGetName = nullptr;
static std::string gProcess;

bool propBool(const char* key, bool defaultValue) {
    char value[PROP_VALUE_MAX]{};
    if (__system_property_get(key, value) <= 0) return defaultValue;

    if (!strcmp(value, "1") ||
        !strcasecmp(value, "true") ||
        !strcasecmp(value, "on")) {
        return true;
    }

    if (!strcmp(value, "0") ||
        !strcasecmp(value, "false") ||
        !strcasecmp(value, "off")) {
        return false;
    }

    return defaultValue;
}

void logLine(const char* fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    __android_log_vprint(ANDROID_LOG_INFO, kTag, fmt, ap);
    va_end(ap);
}

bool shouldDisableForProcess() {
    if (gProcess == kSystemUiProcess) {
        return !propBool("persist.sys.pixelblur.systemui", true);
    }

    if (gProcess == kLauncherProcess) {
        return !propBool("persist.sys.pixelblur.launcher", true);
    }

    return false;
}

bool targetSurfaceMatches(const void* surfaceControlSp) {
    if (!surfaceControlSp || !gGetName) return false;

    const void* surfaceControl =
            *reinterpret_cast<const void* const*>(surfaceControlSp);

    if (!surfaceControl) return false;

    const std::string& name = gGetName(surfaceControl);

    if (gProcess == kSystemUiProcess) {
        return name.find("NotificationShade") != std::string::npos;
    }

    if (gProcess == kLauncherProcess) {
        return name.find("NexusLauncherActivity") != std::string::npos;
    }

    return false;
}

void* hookedSetBlur(
        void* transaction,
        const void* surfaceControlSp,
        int radius) {

    int outRadius = radius;

    if (radius > 0 &&
        shouldDisableForProcess() &&
        targetSurfaceMatches(surfaceControlSp)) {

        outRadius = 0;

        if (propBool("persist.sys.pixelblur.debug", false)) {
            const void* surfaceControl =
                    surfaceControlSp
                        ? *reinterpret_cast<const void* const*>(surfaceControlSp)
                        : nullptr;

            if (surfaceControl && gGetName) {
                const std::string& name = gGetName(surfaceControl);
                logLine(
                        "%s: radius %d -> 0 on %s",
                        gProcess.c_str(),
                        radius,
                        name.c_str());
            } else {
                logLine(
                        "%s: radius %d -> 0",
                        gProcess.c_str(),
                        radius);
            }
        }
    }

    return gOriginalSetBlur
        ? gOriginalSetBlur(transaction, surfaceControlSp, outRadius)
        : transaction;
}

void hookInTargetProcess() {
    auto resolver =
            gApi.newSymbolResolver(kLibGui, nullptr);

    if (!resolver) {
        logLine("Could not create libgui symbol resolver");
        return;
    }

    constexpr const char* kSetBlurSymbol =
            "_ZN7android21SurfaceComposerClient11Transaction23setBackgroundBlurRadiusERKNS_2spINS_14SurfaceControlEEEi";

    constexpr const char* kGetNameSymbol =
            "_ZNK7android14SurfaceControl7getNameEv";

    size_t symbolSize = 0;
    void* target =
            gApi.symbolLookup(
                    resolver,
                    kSetBlurSymbol,
                    false,
                    &symbolSize);

    if (!target) {
        symbolSize = 0;
        target =
                gApi.symbolLookup(
                        resolver,
                        "setBackgroundBlurRadius",
                        true,
                        &symbolSize);

        if (target) {
            logLine(
                    "Using prefix-resolved setBackgroundBlurRadius symbol");
        }
    }

    size_t nameSize = 0;
    void* nameFn =
            gApi.symbolLookup(
                    resolver,
                    kGetNameSymbol,
                    false,
                    &nameSize);

    if (nameFn) {
        gGetName = reinterpret_cast<GetNameFn>(nameFn);
    }

    if (!target) {
        logLine(
                "setBackgroundBlurRadius symbol not found; hook disabled");
        gApi.freeSymbolResolver(resolver);
        return;
    }

    if (!gGetName) {
        logLine(
                "SurfaceControl::getName symbol not found; hook disabled");
        gApi.freeSymbolResolver(resolver);
        return;
    }

    const int result =
            gApi.inlineHook(
                    target,
                    reinterpret_cast<void*>(&hookedSetBlur),
                    reinterpret_cast<void**>(&gOriginalSetBlur));

    if (result != ZN_SUCCESS || !gOriginalSetBlur) {
        logLine(
                "inlineHook(setBackgroundBlurRadius) failed: %d",
                result);
        gApi.freeSymbolResolver(resolver);
        return;
    }

    logLine(
            "Native blur hook active in %s",
            gProcess.c_str());

    gApi.freeSymbolResolver(resolver);
}

void onModuleLoaded(
        void* /*self_handle*/,
        const struct ZygiskNextAPI* api) {

    if (!api) return;

    // ZygiskNext explicitly requires the API table to be copied if it is
    // accessed after this callback returns.
    memcpy(&gApi, api, sizeof(gApi));

    char cmdline[256]{};

    const int fd =
            open("/proc/self/cmdline", O_RDONLY | O_CLOEXEC);

    if (fd >= 0) {
        const ssize_t n =
                read(fd, cmdline, sizeof(cmdline) - 1);
        close(fd);

        if (n > 0) {
            cmdline[n] = '\0';
        }
    }

    gProcess = cmdline;

    if (gProcess != kLauncherProcess &&
        gProcess != kSystemUiProcess) {
        return;
    }

    logLine(
            "Loaded into target process: %s",
            gProcess.c_str());

    hookInTargetProcess();
}

} // namespace

extern "C"
__attribute__((visibility("default"), unused))
struct ZygiskNextModule zn_module = {
        .target_api_version = ZYGISK_NEXT_API_VERSION_1,
        .onModuleLoaded = onModuleLoaded,
};
