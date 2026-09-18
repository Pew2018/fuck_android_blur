#include "zygisk_next_api.h"

#include <android/log.h>
#include <fcntl.h>
#include <cstdarg>
#include <dlfcn.h>
#include <link.h>
#include <strings.h>
#include <sys/system_properties.h>
#include <unistd.h>

#include <cstring>
#include <string>

namespace {

constexpr const char* kTag = "PixelBlur";
constexpr const char* kLauncherProcess = "com.google.android.apps.nexuslauncher";
constexpr const char* kSystemUiProcess = "com.android.systemui";
constexpr const char* kAndroidRuntime = "libandroid_runtime.so";

using SetBlurFn =
        void* (*)(void* transaction, const void* surfaceControl, int radius);

static ZygiskNextAPI gApi{};
static SetBlurFn gOriginalSetBlur = nullptr;
static std::string gProcess;
static bool gHookInstalled = false;

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

bool hookEnabled() {
    // Safety-first: the native interception is opt-in.
    return propBool("persist.sys.pixelblur.hook", false);
}

bool blurDisabledForThisProcess() {
    if (!hookEnabled()) return false;

    if (gProcess == kSystemUiProcess) {
        return !propBool("persist.sys.pixelblur.systemui", true);
    }

    if (gProcess == kLauncherProcess) {
        return !propBool("persist.sys.pixelblur.launcher", true);
    }

    return false;
}

void* hookedSetBlur(
        void* transaction,
        const void* surfaceControl,
        int radius) {

    int outRadius = radius;

    if (radius > 0 && blurDisabledForThisProcess()) {
        outRadius = 0;

        if (propBool("persist.sys.pixelblur.debug", false)) {
            logLine("%s: setBackgroundBlurRadius %d -> 0",
                    gProcess.c_str(), radius);
        }
    }

    return gOriginalSetBlur
        ? gOriginalSetBlur(transaction, surfaceControl, outRadius)
        : transaction;
}

uintptr_t findLibraryBase(const char* soname) {
    uintptr_t result = 0;

    struct SearchState {
        const char* wanted;
        uintptr_t* result;
    } state{soname, &result};

    dl_iterate_phdr(
        [](struct dl_phdr_info* info, size_t, void* raw) -> int {
            auto* state = static_cast<SearchState*>(raw);
            if (!info->dlpi_name || !state) return 0;

            const char* slash = strrchr(info->dlpi_name, '/');
            const char* name = slash ? slash + 1 : info->dlpi_name;

            if (!strcmp(name, state->wanted)) {
                *state->result = static_cast<uintptr_t>(info->dlpi_addr);
                return 1;
            }
            return 0;
        },
        &state);

    return result;
}

void installPltHook() {
    if (!gApi.pltHook) {
        logLine("ZygiskNext PLT hook API unavailable");
        return;
    }

    const uintptr_t base = findLibraryBase(kAndroidRuntime);
    if (!base) {
        logLine("libandroid_runtime.so not found");
        return;
    }

    constexpr const char* kBlurSymbol =
            "_ZN7android21SurfaceComposerClient11Transaction23setBackgroundBlurRadiusERKNS_2spINS_14SurfaceControlEEEi";

    const int result =
            gApi.pltHook(
                    reinterpret_cast<void*>(base),
                    kBlurSymbol,
                    reinterpret_cast<void*>(&hookedSetBlur),
                    reinterpret_cast<void**>(&gOriginalSetBlur));

    if (result != ZN_SUCCESS || !gOriginalSetBlur) {
        logLine("PLT hook failed: %d", result);
        return;
    }

    gHookInstalled = true;
    logLine("Safe PLT blur hook installed in %s", gProcess.c_str());
}

void onModuleLoaded(
        void*,
        const struct ZygiskNextAPI* api) {

    if (!api) return;

    memcpy(&gApi, api, sizeof(gApi));

    char cmdline[256]{};
    const int fd = open("/proc/self/cmdline", O_RDONLY | O_CLOEXEC);

    if (fd >= 0) {
        const ssize_t n = read(fd, cmdline, sizeof(cmdline) - 1);
        close(fd);
        if (n > 0) cmdline[n] = '\0';
    }

    gProcess = cmdline;

    if (gProcess != kLauncherProcess &&
        gProcess != kSystemUiProcess) {
        return;
    }

    logLine("Loaded into target process: %s (hook=%d)",
            gProcess.c_str(), hookEnabled() ? 1 : 0);

    if (!hookEnabled()) {
        return;
    }

    installPltHook();
}

} // namespace

extern "C"
__attribute__((visibility("default"), unused))
struct ZygiskNextModule zn_module = {
        .target_api_version = ZYGISK_NEXT_API_VERSION_1,
        .onModuleLoaded = onModuleLoaded,
};
