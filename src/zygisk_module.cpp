#include <android/log.h>
#include <jni.h>
#include <sys/system_properties.h>
#include <unistd.h>
#include <cstdarg>
#include <cstdio>
#include <strings.h>
#include <cstring>
#include <string>
#include "zygisk.hpp"
namespace {
constexpr const char* kTag="PixelBlur";
constexpr const char* kSystemUiProcess="com.android.systemui";
constexpr const char* kLauncherProcess="com.google.android.apps.nexuslauncher";
using NativeSetBackgroundBlurRadiusFn=void(*)(JNIEnv*,jclass,jlong,jlong,jint);
static NativeSetBackgroundBlurRadiusFn gOriginalNativeSetBackgroundBlurRadius=nullptr;
static JNIEnv* gEnv=nullptr;
static std::string gProcess;
static std::string gStartTicks="unknown";
std::string processStartTicks(){
 char buf[2048]{};FILE* f=fopen("/proc/self/stat","r");if(!f)return "unknown";
 const size_t n=fread(buf,1,sizeof(buf)-1,f);fclose(f);if(!n)return "unknown";
 char* end=strrchr(buf,')');if(!end)return "unknown";char* save=nullptr;char* token=strtok_r(end+1," ",&save);
 for(int field=3;token;field++,token=strtok_r(nullptr," ",&save))if(field==22)return token;
 return "unknown";
}
bool propBool(const char* key,bool defaultValue){
 char value[PROP_VALUE_MAX]{};if(__system_property_get(key,value)<=0)return defaultValue;
 if(!strcmp(value,"1")||!strcasecmp(value,"true")||!strcasecmp(value,"on"))return true;
 if(!strcmp(value,"0")||!strcasecmp(value,"false")||!strcasecmp(value,"off"))return false;
 return defaultValue;
}
void logLine(const char* fmt,...){
 char message[512]{};va_list ap;va_start(ap,fmt);vsnprintf(message,sizeof(message),fmt,ap);va_end(ap);
 __android_log_print(ANDROID_LOG_INFO,kTag,"%s process_start_ticks=%s",message,gStartTicks.c_str());
}
bool hookEnabled(){return propBool("persist.sys.pixelblur.hook",true);}
bool blurDisabledForThisProcess(){
 if(!hookEnabled())return false;
 if(gProcess==kSystemUiProcess)return !propBool("persist.sys.pixelblur.systemui",true);
 if(gProcess==kLauncherProcess)return !propBool("persist.sys.pixelblur.launcher",true);
 return false;
}
void hookedNativeSetBackgroundBlurRadius(JNIEnv* env,jclass clazz,jlong transactionObj,jlong nativeObject,jint blurRadius){
 const jint outRadius=blurRadius>0&&blurDisabledForThisProcess()?0:blurRadius;
 if(outRadius!=blurRadius&&propBool("persist.sys.pixelblur.debug",false))
  logLine("EVENT process=%s action=radius_modified input=%d output=%d",gProcess.c_str(),blurRadius,outRadius);
 if(gOriginalNativeSetBackgroundBlurRadius)gOriginalNativeSetBackgroundBlurRadius(env,clazz,transactionObj,nativeObject,outRadius);
}
class PixelBlurModule final:public zygisk::ModuleBase{
public:
 void onLoad(zygisk::Api* api,JNIEnv* env)override{api_=api;gEnv=env;}
 void preAppSpecialize(zygisk::AppSpecializeArgs* args)override{
  if(!api_||!gEnv||!args||!args->nice_name)return;
  const char* name=gEnv->GetStringUTFChars(args->nice_name,nullptr);if(!name)return;
  gProcess=name;gEnv->ReleaseStringUTFChars(args->nice_name,name);
  if(gProcess!=kSystemUiProcess&&gProcess!=kLauncherProcess)return;
  gStartTicks=processStartTicks();
  logLine("EVENT process=%s action=process_start hook_enabled=%d",gProcess.c_str(),hookEnabled()?1:0);
  if(!hookEnabled()){logLine("EVENT process=%s action=hook_skipped reason=disabled",gProcess.c_str());return;}
  JNINativeMethod method{"nativeSetBackgroundBlurRadius","(JJI)V",reinterpret_cast<void*>(&hookedNativeSetBackgroundBlurRadius)};
  api_->hookJniNativeMethods(gEnv,"android/view/SurfaceControl",&method,1);
  gOriginalNativeSetBackgroundBlurRadius=reinterpret_cast<NativeSetBackgroundBlurRadiusFn>(method.fnPtr);
  if(!gOriginalNativeSetBackgroundBlurRadius){logLine("EVENT process=%s action=hook_install_failed reason=original_pointer_null",gProcess.c_str());return;}
  logLine("EVENT process=%s action=hook_installed interface=SurfaceControl.nativeSetBackgroundBlurRadius",gProcess.c_str());
 }
private:zygisk::Api* api_=nullptr;
};
}
REGISTER_ZYGISK_MODULE(PixelBlurModule)
