const ksuApi=window.ksu;
const $=id=>document.getElementById(id);
const toast=s=>{const e=$('toast');e.textContent=s;e.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove('show'),2600)};
let execSeq=0, writeBusy=false, refreshSeq=0, refreshAgain=false, refreshPromise=null, themeSeq=0, themeDetecting=false;
const preview=new URLSearchParams(location.search).get('preview');
function execRoot(cmd,timeoutMs=15000){
 if(!ksuApi||typeof ksuApi.exec!=='function')return Promise.reject(new Error('KernelSU Next WebUI API 不可用'));
 return new Promise((resolve,reject)=>{
  const name='__pixelBlurExecCallback_'+(++execSeq);let settled=false;
  const cleanup=()=>{clearTimeout(timer);try{delete window[name]}catch(_){}};
  const finish=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value)};
  const timer=setTimeout(()=>finish(reject,Object.assign(new Error('等待命令回调超时；底层命令可能仍在执行'),{timeout:true})),timeoutMs);
  window[name]=(code,out,err)=>{const n=Number(code);if(n===0)finish(resolve,String(out||''));else finish(reject,new Error(String(err||out||('命令执行失败，exit='+n))))};
  try{ksuApi.exec(cmd,name)}catch(e){finish(reject,e)}
 });
}
const sh=async cmd=>(await execRoot(cmd)).trim();
if(preview)window.PixelBlurExec=execRoot;
async function writeProp(key,on){const expected=on?'1':'0';await sh('setprop '+key+' '+expected);const actual=await sh('getprop '+key);if(actual!==expected)throw new Error('写入读回不匹配：'+key)}
function parsePairs(raw){return Object.fromEntries(raw.split(/\r?\n/).filter(Boolean).map(line=>{const i=line.indexOf('=');return i<0?[line,'']:[line.slice(0,i),line.slice(i+1)]}))}
function parseWmBlur(text){
 const s=String(text||'');
 let supported=null,allowed=null;
 const sup=s.match(/blur supported on device\s*:\s*(true|false|1|0)/i);
 const ena=s.match(/blur enabled\s*:\s*(true|false|1|0)/i);
 if(sup)supported=/^(true|1)$/i.test(sup[1]);
 else if(/(not supported|unsupported|does not support|blur.*unavailable)/i.test(s))supported=false;
 else if(/(blur.*supported|supported.*blur|cross.window blur.*available)/i.test(s))supported=true;
 if(ena)allowed=/^(true|1)$/i.test(ena[1]);
 else if(/(currently disabled|blur is disabled|blur disabled|blur.*off)/i.test(s))allowed=false;
 else if(/(currently enabled|blur is enabled|blur.*on)/i.test(s))allowed=true;
 return {supported,allowed};
}
function parseHookState(s){return ['installed','not_installed','not_running'].includes(s)?s:'unknown'}
function targetState(saved,pid,hook){
 if(!pid)return '目标进程未运行';
 hook=parseHookState(hook);
 if(hook==='unknown')return '运行状态未确认';
 if(saved&&hook==='installed')return 'Hook 已安装；组件配置将在下一次相关模糊提交时读取';
 if(saved&&hook==='not_installed')return '配置已保存，等待目标进程重新启动后安装 Hook';
 if(!saved&&hook==='installed')return '拦截已旁路；进程重新启动后完全卸载 Hook';
 return '原生拦截未启用';
}
function parseGlobal(setting,wmText){
 const wm=parseWmBlur(wmText),failed=setting==='__QUERY_FAILED__';
 const explicit=setting==='0'||setting==='1'?setting:null;
 const allowed=failed?null:wm.allowed;
 return {explicit,allowed,supported:failed?null:wm.supported,queryFailed:failed};
}
window.PixelBlurModel={parseWmBlur,parseGlobal,targetState,parseHookState};
function setTheme(dark){document.documentElement.dataset.theme=dark?'dark':'light';$('themeDark').checked=!!dark}
function readTheme(){
 let follow=true,manual=null;
 try{const f=localStorage.getItem('pixelBlur.theme.followSystem'),m=localStorage.getItem('pixelBlur.theme.manualDark');if(f!==null)follow=f==='1';if(m==='0'||m==='1')manual=m==='1'}catch(_){}
 return {follow,manual};
}
function saveTheme(follow,manual){
 try{localStorage.setItem('pixelBlur.theme.followSystem',follow?'1':'0');if(manual!==null)localStorage.setItem('pixelBlur.theme.manualDark',manual?'1':'0')}catch(_){}
}
function applyInitialTheme(){
 const stored=readTheme(),media=window.matchMedia?.('(prefers-color-scheme: dark)');
 const fallback=stored.manual===null?!!media?.matches:stored.manual;
 setTheme(stored.follow?(!!media?.matches):fallback);
 $('themeAuto').checked=stored.follow;$('themeDark').disabled=stored.follow;
}
async function detectSystemTheme(){
 const raw=await sh('dumpsys uimode 2>/dev/null | grep -m 1 "mComputedNightMode=" || true');
 const m=raw.match(/mComputedNightMode=(true|false)/i);
 if(m)return {dark:m[1].toLowerCase()==='true',source:'系统 UiModeManager'};
 const media=window.matchMedia?.('(prefers-color-scheme: dark)');
 if(media)return {dark:media.matches,source:'WebView 主题回退'};
 throw new Error('无法读取系统主题');
}
async function syncSystemTheme(){
 if(themeDetecting)return;themeDetecting=true;const seq=++themeSeq;
 try{const state=await detectSystemTheme(),prefs=readTheme();if(seq!==themeSeq||!prefs.follow)return;setTheme(state.dark);$('themeAuto').checked=true;$('themeDark').disabled=true;$('themeState').textContent='自动检测：手机当前为'+(state.dark?'深色':'浅色')+'模式 · '+state.source}
 catch(e){if(seq===themeSeq&&readTheme().follow)$('themeState').textContent='系统主题检测失败；保留当前 WebUI 外观'}
 finally{themeDetecting=false}
}
$('themeAuto').addEventListener('change',async e=>{
 const on=e.target.checked,p=readTheme();saveTheme(on,p.manual);
 if(on){await syncSystemTheme();toast('已切换为自动跟随系统主题')}
 else{$('themeAuto').checked=false;$('themeDark').disabled=false;$('themeState').textContent='手动模式：使用已保存的 WebUI 主题';if(p.manual!==null)setTheme(p.manual);toast('已关闭自动跟随')}
});
$('themeDark').addEventListener('change',e=>{const dark=e.target.checked;saveTheme(false,dark);themeSeq++;setTheme(dark);$('themeAuto').checked=false;$('themeDark').disabled=false;$('themeState').textContent='手动模式：WebUI 外观已保存';toast(dark?'WebUI 已切换为深色':'WebUI 已切换为浅色')});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&readTheme().follow)syncSystemTheme()});
function setBusy(value){
 writeBusy=value;document.querySelectorAll('.write-control').forEach(e=>e.disabled=value||(e.dataset.unknown==='1'));
 document.body.classList.toggle('busy',value);
}
async function refreshStatus(){
 if(preview){renderPreview();return}
 const seq=++refreshSeq;
 const command='printf "hook=%s\\nglobal=%s\\nsystemui=%s\\nlauncher=%s\\n" "$(getprop persist.sys.pixelblur.hook)" "$(settings get global disable_window_blurs 2>/dev/null || echo __QUERY_FAILED__)" "$(getprop persist.sys.pixelblur.systemui)" "$(getprop persist.sys.pixelblur.launcher)"; echo "__WM_BEGIN__"; wm disable-blur 2>&1; echo "__WM_END__"; /data/adb/modules/pixelblur-controller/action.sh status';
 const raw=await sh(command);if(seq!==refreshSeq)return;
 const globalRaw=(raw.match(/^global=(.*)$/m)||[])[1]||'';
 const wm=(raw.match(/__WM_BEGIN__\r?\n([\s\S]*?)\r?\n__WM_END__/m)||[])[1]||'';
 const cfg=parsePairs(raw.split('__WM_BEGIN__')[0]);const g=parseGlobal(globalRaw,wm);
 const enabled=cfg.hook==='1';
 $('hook').checked=enabled;
 $('systemui').checked=cfg.systemui!=='0';$('launcher').checked=cfg.launcher!=='0';
 const known=g.allowed!==null;
 $('global').checked=known?g.allowed:false;$('global').dataset.unknown=known?'0':'1';$('global').disabled=!known||writeBusy;
 $('globalState').textContent='设置值：'+(g.explicit===null?'系统默认':g.explicit)+' · '+(g.supported===null?'支持情况无法确认':g.supported?'系统支持跨窗口模糊':'系统不支持跨窗口模糊')+' · '+(g.allowed===null?'当前状态无法确认':g.allowed?'系统允许跨窗口模糊':'系统全局禁止模糊');
 const targets=parsePairs(raw.split('__WM_END__').pop());
 $('systemuiState').textContent=targetState(enabled,targets['systemui.pid'],targets['systemui.hook']);
 $('launcherState').textContent=targetState(enabled,targets['launcher.pid'],targets['launcher.hook']);
 const hint=enabled?'已保存配置；请分别查看 SystemUI 与 Launcher 当前运行状态':'拦截已停用；若目标进程仍驻留 Hook 将被旁路，进程重新启动后完全卸载';
 $('runtimeHint').textContent=hint+(g.allowed===false?' · 全局设置禁止模糊，组件开关仍保留保存值':'');
 $('status').textContent='已保存配置：总开关 '+(enabled?'开启':'关闭')+'；SystemUI '+(cfg.systemui==='0'?'关闭':'开启')+'；Launcher '+(cfg.launcher==='0'?'关闭':'开启')+'。\nSystemUI：'+$('systemuiState').textContent+'\nLauncher：'+$('launcherState').textContent;
}
function renderPreview(){
 const dark=preview==='dark';$('hook').checked=true;$('global').checked=true;$('systemui').checked=true;$('launcher').checked=false;
 $('globalState').textContent='模拟预览：设置值 0 · 系统支持跨窗口模糊 · 系统允许跨窗口模糊';
 $('systemuiState').textContent='模拟预览：Hook 已安装；下一次相关模糊提交时读取';
 $('launcherState').textContent='模拟预览：目标进程未运行';
 $('runtimeHint').textContent='模拟数据，仅用于检查界面布局，不代表设备 Hook 状态';
 $('status').textContent='模拟预览模式 · '+(dark?'深色':'浅色')+' · 不代表设备运行状态';
 $('diag').textContent='预览模拟数据：SystemUI PID 1234 Hook installed；Launcher not running';
}
async function refreshDiagnostics(){
 if(preview){renderPreview();return}
 $('diag').textContent='读取中…';
 try{$('diag').textContent=await sh('/data/adb/modules/pixelblur-controller/action.sh')}
 catch(e){$('diag').textContent='诊断读取失败：'+(e?.message||String(e))}
}
async function refresh(full=false){
 if(preview){refreshStatus();return}
 if(refreshPromise){refreshAgain=true;return refreshPromise}
 refreshPromise=(async()=>{do{refreshAgain=false;try{await refreshStatus();if(full)await refreshDiagnostics()}catch(e){$('status').textContent='状态读取失败：'+(e?.message||String(e))}}while(refreshAgain)})();
 try{await refreshPromise}finally{refreshPromise=null}
}
async function writeAction(id,on){
 if(writeBusy)return;setBusy(true);$('runtimeHint').textContent='正在保存设置…';
 try{
  if(id==='hook')await writeProp('persist.sys.pixelblur.hook',on);
  else if(id==='systemui')await writeProp('persist.sys.pixelblur.systemui',on);
  else if(id==='launcher')await writeProp('persist.sys.pixelblur.launcher',on);
  else if(id==='global')await sh('/data/adb/modules/pixelblur-controller/global_blur.sh set '+(on?'allow':'deny'));
  toast('设置已保存并完成读回验证');
 }catch(e){if(e.timeout)window.__pixelBlurLastTimeout=true;toast((e.timeout?'等待回调超时，底层命令可能仍在执行；重新读取状态：':'保存失败：')+(e.message||String(e)))}
 finally{
  try{if(window.__pixelBlurLastTimeout)await new Promise(r=>setTimeout(r,700));await refresh()}catch(_){}
  window.__pixelBlurLastTimeout=false;setBusy(false);
 }
}
['hook','global','systemui','launcher'].forEach(id=>$(id).addEventListener('change',e=>writeAction(id,e.target.checked)));
$('refresh').addEventListener('click',()=>refresh(true));
$('blurMoreToggle').addEventListener('click',()=>{const c=$('blurMoreContent'),open=c.classList.contains('hidden');c.classList.toggle('hidden',!open);$('blurMoreToggle').setAttribute('aria-expanded',String(open));$('blurMoreIcon').textContent=open?'－':'＋'});
const dialog=$('confirmDialog');
$('restoreGlobal').addEventListener('click',()=>{dialog.classList.add('show');dialog.setAttribute('aria-hidden','false')});
$('cancelRestore').addEventListener('click',closeDialog);
function closeDialog(){dialog.classList.remove('show');dialog.setAttribute('aria-hidden','true')}
$('confirmRestore').addEventListener('click',async()=>{
 if(writeBusy)return;closeDialog();setBusy(true);toast('正在恢复全局模糊原值…');
 try{const out=await sh('/data/adb/modules/pixelblur-controller/global_blur.sh restore');toast(out);await refresh();await refreshDiagnostics()}
 catch(e){toast('恢复失败：'+(e.message||String(e)));$('diag').textContent='恢复失败，若记录存在会保留供重试。 '+(e.message||String(e))}
 finally{setBusy(false)}
});
function init(){
 applyInitialTheme();const p=readTheme();
 if(preview){setTheme(preview==='dark');$('themeAuto').checked=false;$('themeDark').disabled=false;$('themeState').textContent='模拟预览模式 · 不代表设备主题';}
 else if(p.follow)syncSystemTheme();else{$('themeAuto').checked=false;$('themeDark').disabled=false;$('themeState').textContent='手动模式：使用已保存的 WebUI 主题';}
 refresh(true);
}
init();
