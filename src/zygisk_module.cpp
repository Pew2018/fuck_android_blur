#include <android/log.h>
#include <jni.h>
#include <sys/system_properties.h>
#include <unistd.h>

#include <cstdarg>
#include <cstdint>
#include <cstdlib>
#include <strings.h>
#include <cstring>
#include <string>

#include "zygisk.hpp"

namespace {

constexpr const char* kTag = "PixelBlur";
constexpr const char* kSystemUiProcess = "com.android.systemui";
constexpr const char* kLauncherProcess = "com.google.android.apps.nexuslauncher";
constexpr int kDefaultBlurIntensity = 100;
constexpr int kMaxBlurIntensity = 500;

using NativeSetBackgroundBlurRadiusFn =
        void (*)(JNIEnv*, jclass, jlong, jlong, jint);

static NativeSetBackgroundBlurRadiusFn gOriginalNativeSetBackgroundBlurRadius = nullptr;
static JNIEnv* gEnv = nullptr;
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

int propInt(const char* key, int defaultValue, int minValue, int maxValue) {
    char value[PROP_VALUE_MAX]{};
    if (__system_property_get(key, value) <= 0) return defaultValue;

    char* end = nullptr;
    const long parsed = strtol(value, &end, 10);
    if (end == value || *end != '\0') return defaultValue;

    if (parsed < minValue) return minValue;
    if (parsed > maxValue) return maxValue;
    return static_cast<int>(parsed);
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

int blurIntensityForThisProcess() {
    if (gProcess == kSystemUiProcess) {
        return propInt(
                "persist.sys.pixelblur.systemui.intensity",
                kDefaultBlurIntensity,
                0,
                kMaxBlurIntensity);
    }

    if (gProcess == kLauncherProcess) {
        return propInt(
                "persist.sys.pixelblur.launcher.intensity",
                kDefaultBlurIntensity,
                0,
                kMaxBlurIntensity);
    }

    return kDefaultBlurIntensity;
}

jint applyBlurIntensity(jint blurRadius, int intensity) {
    const int64_t scaled =
            (static_cast<int64_t>(blurRadius) * intensity + 50) / 100;

    return static_cast<jint>(scaled);
}

void hookedNativeSetBackgroundBlurRadius(
        JNIEnv* env,
        jclass clazz,
        jlong transactionObj,
        jlong nativeObject,
        jint blurRadius) {

    jint outRadius = blurRadius;

    if (blurRadius > 0 && hookEnabled()) {
        if (blurDisabledForThisProcess()) {
            outRadius = 0;

            if (propBool("persist.sys.pixelblur.debug", false)) {
                logLine("%s: nativeSetBackgroundBlurRadius %d -> 0",
                        gProcess.c_str(),
                        static_cast<int>(blurRadius));
            }
        } else {
            const int intensity = blurIntensityForThisProcess();

            if (intensity != kDefaultBlurIntensity) {
                outRadius = applyBlurIntensity(blurRadius, intensity);

                if (propBool("persist.sys.pixelblur.debug", false)) {
                    logLine("%s: nativeSetBackgroundBlurRadius %d -> %d (intensity=%d%%)",
                            gProcess.c_str(),
                            static_cast<int>(blurRadius),
                            static_cast<int>(outRadius),
                            intensity);
                }
            }
        }
    }

    if (gOriginalNativeSetBackgroundBlurRadius) {
        gOriginalNativeSetBackgroundBlurRadius(
                env,
                clazz,
                transactionObj,
                nativeObject,
                outRadius);
    }
}

class PixelBlurModule final : public zygisk::ModuleBase {
public:
    void onLoad(zygisk::Api* api, JNIEnv* env) override {
        api_ = api;
        gEnv = env;
    }

    void preAppSpecialize(zygisk::AppSpecializeArgs* args) override {
        if (!api_ || !gEnv || !args || !args->nice_name) return;

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
                gProcess.c_str(),
                hookEnabled() ? 1 : 0);

        if (!hookEnabled()) return;

        JNINativeMethod method{
                "nativeSetBackgroundBlurRadius",
                "(JJI)V",
                reinterpret_cast<void*>(&hookedNativeSetBackgroundBlurRadius),
        };

        api_->hookJniNativeMethods(
                gEnv,
                "android/view/SurfaceControl",
                &method,
                1);

        gOriginalNativeSetBackgroundBlurRadius =
                reinterpret_cast<NativeSetBackgroundBlurRadiusFn>(method.fnPtr);

        if (!gOriginalNativeSetBackgroundBlurRadius) {
            logLine("JNI hook failed: original nativeSetBackgroundBlurRadius is null");
            return;
        }

        logLine("JNI blur hook installed in %s",
                gProcess.c_str());
    }

private:
    zygisk::Api* api_ = nullptr;
};

} // namespace

REGISTER_ZYGISK_MODULE(PixelBlurModule)
