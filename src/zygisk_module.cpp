#include "zygisk.hpp"

#include <android/log.h>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <strings.h>
#include <sys/system_properties.h>
#include <sys/sysmacros.h>
#include <unistd.h>

#include <string>

namespace {

constexpr const char* kTag = "PixelBlur";
constexpr const char* kSystemUiProcess = "com.android.systemui";
constexpr const char* kLauncherProcess = "com.google.android.apps.nexuslauncher";
constexpr const char* kAndroidRuntimeName = "libandroid_runtime.so";

using SetBlurFn =
        void* (*)(void* transaction, const void* surfaceControl, int radius);

static zygisk::Api* gApi = nullptr;
static JNIEnv* gEnv = nullptr;
static SetBlurFn gOriginalSetBlur = nullptr;
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

bool hookEnabled() {
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

bool findAndroidRuntimeIdentity(dev_t* dev, ino_t* inode) {
    if (!dev || !inode) return false;

    FILE* fp = fopen("/proc/self/maps", "re");
    if (!fp) {
        logLine("Unable to open /proc/self/maps");
        return false;
    }

    char line[1024]{};
    while (fgets(line, sizeof(line), fp)) {
        unsigned long start = 0;
        unsigned long end = 0;
        unsigned long offset = 0;
        unsigned int major = 0;
        unsigned int minor = 0;
        unsigned long mapInode = 0;
        char perms[5]{};
        char path[768]{};

        const int fields = sscanf(
                line,
                "%lx-%lx %4s %lx %x:%x %lu %767[^\\n]",
                &start,
                &end,
                perms,
                &offset,
                &major,
                &minor,
                &mapInode,
                path);

        if (fields < 8) continue;
        if (!strstr(path, kAndroidRuntimeName)) continue;
        if (!strchr(perms, 'x')) continue;
        if (mapInode == 0) continue;

        *dev = makedev(major, minor);
        *inode = static_cast<ino_t>(mapInode);
        fclose(fp);
        return true;
    }

    fclose(fp);
    return false;
}

bool registerPltHook() {
    if (!gApi) {
        logLine("Zygisk API unavailable");
        return false;
    }

    dev_t dev = 0;
    ino_t inode = 0;
    if (!findAndroidRuntimeIdentity(&dev, &inode)) {
        logLine("libandroid_runtime.so mapping not found");
        return false;
    }

    constexpr const char* kBlurSymbol =
            "_ZN7android21SurfaceComposerClient11Transaction23setBackgroundBlurRadiusERKNS_2spINS_14SurfaceControlEEEi";

    gApi->pltHookRegister(
            dev,
            inode,
            kBlurSymbol,
            reinterpret_cast<void*>(&hookedSetBlur),
            reinterpret_cast<void**>(&gOriginalSetBlur));

    if (!gApi->pltHookCommit()) {
        logLine("Zygisk PLT hook commit failed");
        gOriginalSetBlur = nullptr;
        return false;
    }

    if (!gOriginalSetBlur) {
        logLine("Zygisk PLT hook committed but original symbol is null");
        return false;
    }

    logLine("Zygisk PLT blur hook installed in %s", gProcess.c_str());
    return true;
}

class PixelBlurModule final : public zygisk::ModuleBase {
public:
    void onLoad(zygisk::Api* api, JNIEnv* env) override {
        gApi = api;
        gEnv = env;
    }

    void preAppSpecialize(zygisk::AppSpecializeArgs* args) override {
        if (!gEnv || !args || !args->nice_name) return;

        const char* name =
                gEnv->GetStringUTFChars(args->nice_name, nullptr);
        if (!name) return;

        gProcess = name;
        gEnv->ReleaseStringUTFChars(args->nice_name, name);

        if (gProcess != kSystemUiProcess &&
            gProcess != kLauncherProcess) {
            return;
        }

        logLine("Loaded into target process: %s (hook=%d)",
                gProcess.c_str(), hookEnabled() ? 1 : 0);

        if (!hookEnabled()) return;

        registerPltHook();
    }
};

} // namespace

REGISTER_ZYGISK_MODULE(PixelBlurModule)
