import {MDCSwitch} from '@material/switch';
import {MDCRipple} from '@material/ripple';
import {MDCLinearProgress} from '@material/linear-progress';
import {MDCDialog} from '@material/dialog';
import {MDCSnackbar} from '@material/snackbar';

const ksuApi=window.ksu;
const $=id=>document.getElementById(id);
let execSeq=0,writeBusy=false,refreshSeq=0,refreshAgain=false,refreshPromise=null,themeSeq=0,themePromise=null,hookSaved=false,globalAllowed=null,systemuiSaved=true,launcherSaved=true;
const preview=new URLSearchParams(location.search).get('preview');
const mdcSwitches=new Map();
document.querySelectorAll('.mdc-switch').forEach(el=>{const control=new MDCSwitch(el);mdcSwitches.set(el.querySelector('input').id,control)});
document.querySelectorAll('.mdc-button').forEach(el=>new MDCRipple(el));
const progress=new MDCLinearProgress($('operationProgress'));

let loadingProgress=null,loadingStartToken=0,loadingFrame=0;
function ensureLoadingProgress(){
 if(!loadingProgress)loadingProgress=new MDCLinearProgress($('loadingProgress'));
 return loadingProgress;
}
function cancelLoadingProgressFrame(){
 if(loadingFrame){cancelAnimationFrame(loadingFrame);loadingFrame=0}
}
function scheduleLoadingProgress(token,shell){
 cancelLoadingProgressFrame();
 if(document.hidden)return;
 loadingFrame=requestAnimationFrame(()=>{
  loadingFrame=requestAnimationFrame(()=>{
   loadingFrame=0;
   if(token!==loadingStartToken||shell.hidden||document.hidden)return;
   const indicator=ensureLoadingProgress(),root=indicator.root;
   root.classList.remove('mdc-linear-progress--animation-ready');
   root.getBoundingClientRect();
   root.classList.add('mdc-linear-progress--animation-ready');
   indicator.open();
  });
 });
}
function startLoadingProgress(){
 const token=++loadingStartToken,shell=$('loadingShell');
 shell.hidden=false;
 document.body.classList.add('loading-active');
 setProgress(false);
 scheduleLoadingProgress(token,shell);
}
function stopLoadingProgress(){
 loadingStartToken++;
 cancelLoadingProgressFrame();
 if(loadingProgress)loadingProgress.close();
 document.body.classList.remove('loading-active');
}
const snackbar=new MDCSnackbar($('snackbar'));
const dialog=new MDCDialog($('restoreDialog'));
window.PixelBlurMDC={MDCSwitch,MDCRipple,MDCLinearProgress,MDCDialog,MDCSnackbar};
function toast(message){$('snackbarLabel').textContent=message;snackbar.open()}
function setProgress(active,label='正在读取系统状态…'){
 $('operationProgress').setAttribute('aria-label',label);$('operationProgress').setAttribute('aria-hidden',String(!active));
 document.body.classList.toggle('progress-active',active);
 if(active){stopLoadingProgress();progress.open()}else progress.close();
}
function execRoot(cmd,timeoutMs=15000){
 if(!ksuApi||typeof ksuApi.exec!=='function')return Promise.reject(new Error('KernelSU Next 接口不可用'));
 return new Promise((resolve,reject)=>{
  const name='__pixelBlurExecCallback_'+(++execSeq);let settled=false,timer;
  const cleanup=()=>{clearTimeout(timer);try{delete window[name]}catch(_){}};
  const finish=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value)};
  timer=setTimeout(()=>finish(reject,Object.assign(new Error('等待命令回调超时；底层命令可能仍在执行'),{timeout:true})),timeoutMs);
  window[name]=(code,out,err)=>{const n=Number(code);if(n===0)finish(resolve,String(out||''));else finish(reject,new Error(String(err||out||('命令执行失败，exit='+n))))};
  try{ksuApi.exec(cmd,name)}catch(e){finish(reject,e)}
 });
}
const sh=async cmd=>(await execRoot(cmd)).trim();
if(preview)window.PixelBlurExec=execRoot;
async function writeProp(key,on){const expected=on?'1':'0';await sh('/system/bin/setprop '+key+' '+expected);const actual=await sh('/system/bin/getprop '+key);if(actual!==expected)throw new Error('写入读回不匹配：'+key)}
function parsePairs(raw){return Object.fromEntries(raw.split(/\r?\n/).filter(Boolean).map(line=>{const i=line.indexOf('=');return i<0?[line,'']:[line.slice(0,i),line.slice(i+1)]}))}
function parseWmBlur(text){
 const s=String(text||'');let supported=null,allowed=null;
 const sup=s.match(/blur supported on device\s*:\s*(true|false|1|0)/i),ena=s.match(/blur enabled\s*:\s*(true|false|1|0)/i);
 if(sup)supported=/^(true|1)$/i.test(sup[1]);else if(/(not supported|unsupported|does not support|blur.*unavailable)/i.test(s))supported=false;else if(/(blur.*supported|supported.*blur|cross.window blur.*available)/i.test(s))supported=true;
 if(ena)allowed=/^(true|1)$/i.test(ena[1]);else if(/(currently disabled|blur is disabled|blur disabled|blur.*off)/i.test(s))allowed=false;else if(/(currently enabled|blur is enabled|blur.*on)/i.test(s))allowed=true;
 return{supported,allowed};
}
function targetState(saved,pid,hook){
 if(!pid)return'目标进程未运行';
 hook=['installed','not_installed','not_running'].includes(hook)?hook:'unknown';
 if(hook==='unknown')return'运行状态未确认';
 if(saved&&hook==='installed')return'Hook 已安装';
 if(saved&&hook==='not_installed')return'等待目标进程重启';
 if(!saved&&hook==='installed')return'拦截已旁路';
 return'原生拦截未启用';
}
function parseGlobal(setting,wmText){
 const wm=parseWmBlur(wmText),failed=setting==='__QUERY_FAILED__',explicit=setting==='0'||setting==='1'?setting:null;
 return{explicit,allowed:failed?null:wm.allowed,supported:failed?null:wm.supported,queryFailed:failed};
}
function childVisual(saved,global,hook){
 const enabled=global===true&&hook===true;
 return{checked:enabled&&saved,disabled:global!==true||hook!==true};
}
window.PixelBlurModel={parseWmBlur,parseGlobal,targetState,childVisual};
function setSwitch(id,checked,disabled){
 const control=mdcSwitches.get(id);if(!control)return;
 control.checked=!!checked;control.disabled=!!disabled;
 const input=$(id);input.setAttribute('aria-checked',String(!!checked));input.closest('.mdc-switch').classList.toggle('mdc-switch--disabled',!!disabled);
}
function readTheme(){
 let follow=true,manual=null;try{const f=localStorage.getItem('pixelBlur.theme.followSystem'),m=localStorage.getItem('pixelBlur.theme.manualDark');if(f!==null)follow=f==='1';if(m==='0'||m==='1')manual=m==='1'}catch(_){}
 return{follow,manual};
}
function saveTheme(follow,manual){try{localStorage.setItem('pixelBlur.theme.followSystem',follow?'1':'0');if(manual!==null)localStorage.setItem('pixelBlur.theme.manualDark',manual?'1':'0')}catch(_){}}
function setTheme(dark){document.documentElement.dataset.theme=dark?'dark':'light';setSwitch('themeDark',dark,readTheme().follow)}
function applyInitialTheme(){const p=readTheme(),media=window.matchMedia?.('(prefers-color-scheme: dark)');const dark=p.follow?!!media?.matches:(p.manual??!!media?.matches);document.documentElement.dataset.theme=dark?'dark':'light';$('themeAuto').checked=p.follow;$('themeDark').checked=dark;$('themeDark').disabled=p.follow;$('themeDark').closest('.mdc-switch').classList.toggle('mdc-switch--disabled',p.follow)}
async function detectSystemTheme(){
 const raw=await sh('/system/bin/dumpsys uimode 2>/dev/null | /system/bin/grep -m 1 "mComputedNightMode=" || true'),m=raw.match(/mComputedNightMode=(true|false)/i);
 if(m)return{dark:m[1].toLowerCase()==='true',source:'系统主题'};const media=window.matchMedia?.('(prefers-color-scheme: dark)');if(media)return{dark:media.matches,source:'WebView 主题'};throw new Error('无法读取系统主题');
}
async function syncSystemTheme(){
 const seq=++themeSeq;
 if(themePromise){try{await themePromise}catch(_){}if(seq!==themeSeq||!readTheme().follow)return}
 const request=(async()=>{
  try{const state=await detectSystemTheme(),p=readTheme();if(seq!==themeSeq||!p.follow)return;document.documentElement.dataset.theme=state.dark?'dark':'light';setSwitch('themeAuto',true,false);setSwitch('themeDark',state.dark,true);$('themeState').textContent='手机当前为'+(state.dark?'深色':'浅色')+'模式'}
  catch(_){if(seq===themeSeq&&readTheme().follow)$('themeState').textContent='无法读取系统主题'}
 })();
 themePromise=request;try{await request}finally{if(themePromise===request)themePromise=null}
}
function setBusy(value){
 writeBusy=value;document.querySelectorAll('.write-control').forEach(el=>{const parent=el.closest('.mdc-switch'),locked=el.dataset.locked==='1';el.disabled=value||locked;if(parent){parent.classList.toggle('mdc-switch--disabled',value||locked);const sw=mdcSwitches.get(el.id);if(sw)sw.disabled=value||locked}});
 $('blurMoreToggle').disabled=value;$('restoreButton').disabled=value;
 document.body.classList.toggle('busy',value);
}
function updateChildren(){
 const sys=childVisual(systemuiSaved,globalAllowed,hookSaved),launch=childVisual(launcherSaved,globalAllowed,hookSaved);
 $('systemui').dataset.locked=sys.disabled?'1':'0';$('launcher').dataset.locked=launch.disabled?'1':'0';
 setSwitch('systemui',sys.checked,sys.disabled||writeBusy);setSwitch('launcher',launch.checked,launch.disabled||writeBusy);
 const reason=globalAllowed!==true?'需要先开启全局模糊':!hookSaved?'需要先开启 Native Hook':'已保存';
 $('childSummary').textContent=reason;
 $('systemuiState').textContent='';
 $('launcherState').textContent='';
}
function renderGlobal(g){
 globalAllowed=g.allowed;
 const input=$('global'),known=g.allowed!==null;
 setSwitch('global',known&&g.allowed,!known||writeBusy);
 input.dataset.unknown=known?'0':'1';input.dataset.locked=known?'0':'1';
 $('globalState').textContent='';
 $('globalMeta').textContent='设置：'+(g.explicit===null?'系统默认':g.explicit)+' · '+(g.supported===null?'能力未知':g.supported?'设备支持':'设备不支持');
 $('globalSummary').textContent=g.allowed===false?'全局关闭时，组件模糊不可用':'允许 Android 使用窗口模糊';
}
async function refreshStatus(){
 if(preview){renderPreview(preview);return}
 const seq=++refreshSeq;
 const command='global=$(/system/bin/settings get global disable_window_blurs 2>/dev/null); [ -n "$global" ] || global=__QUERY_FAILED__; printf "hook=%s\nglobal=%s\nsystemui=%s\nlauncher=%s\n" "$(/system/bin/getprop persist.sys.pixelblur.hook)" "$global" "$(/system/bin/getprop persist.sys.pixelblur.systemui)" "$(/system/bin/getprop persist.sys.pixelblur.launcher)"; echo "__WM_BEGIN__"; /system/bin/wm disable-blur 2>&1; echo "__WM_END__"; /system/bin/sh /data/adb/modules/pixelblur-controller/action.sh status';
 const raw=await sh(command);if(seq!==refreshSeq)return;
 const globalRaw=(raw.match(/^global=(.*)$/m)||[])[1]||'__QUERY_FAILED__',wm=(raw.match(/__WM_BEGIN__\r?\n([\s\S]*?)\r?\n__WM_END__/m)||[])[1]||'';
 const cfg=parsePairs(raw.split('__WM_BEGIN__')[0]),g=parseGlobal(globalRaw,wm),targets=parsePairs(raw.split('__WM_END__').pop());
 hookSaved=cfg.hook==='1';systemuiSaved=cfg.systemui!=='0';launcherSaved=cfg.launcher!=='0';
 setSwitch('hook',hookSaved,writeBusy);renderGlobal(g);updateChildren();
 const hook=hookSaved?'已启用':'已停用';$('hookState').textContent='';
 $('hookMeta').textContent=hookSaved?'运行状态按目标进程分别显示':'已保存的子项设置仍会保留';
 const sysRun=targetState(hookSaved,targets['systemui.pid'],targets['systemui.hook']),launchRun=targetState(hookSaved,targets['launcher.pid'],targets['launcher.hook']);
 $('systemuiRuntime').textContent=sysRun;$('launcherRuntime').textContent=launchRun;
 $('runtimeSummary').textContent=g.allowed===false?'系统模糊已关闭':!hookSaved?'Native Hook 已停用':sysRun==='目标进程未运行'&&launchRun==='目标进程未运行'?'目标进程未运行':sysRun==='Hook 已安装'||launchRun==='Hook 已安装'?'Native Hook 已安装':sysRun==='等待目标进程重启'||launchRun==='等待目标进程重启'?'等待目标进程重启':'运行状态未确认';
 $('runtimeDetails').textContent='SystemUI：'+sysRun+'\nLauncher：'+launchRun+'\n全局窗口模糊：'+(g.allowed===null?'无法确认':g.allowed?'允许':'禁止')+'；这不代表界面当前正在绘制模糊。';
 $('diagnosticsSummary').textContent='SystemUI '+sysRun+' · Launcher '+launchRun;
 $('status').textContent='全局模糊：'+(g.allowed===null?'无法读取':g.allowed?'已允许':'已关闭')+'\nNative Hook：'+hook+'\nSystemUI：'+sysRun+'\nLauncher：'+launchRun+'\n\nHook 仅控制目标进程通过指定接口提交的背景模糊。';
 return g;
}
function renderPreview(mode){
 if(mode==='dark'||mode==='light'){document.documentElement.dataset.theme=mode;setSwitch('themeAuto',false,false);setSwitch('themeDark',mode==='dark',false);$('themeState').textContent='模拟主题预览'}
 if(mode==='loading'){setProgress(false);$('main').hidden=true;$('loadingShell').hidden=false;startLoadingProgress();return}
 if(mode==='error'){stopLoadingProgress();setProgress(false);$('main').hidden=true;$('loadingShell').hidden=false;$('loadingText').textContent='无法读取模块状态';$('loadingSubtext').textContent='请检查 KernelSU Next 授权后重试';$('loadingError').hidden=false;return}
 const globalOff=mode==='global-off',busy=mode==='busy';
 stopLoadingProgress();$('loadingShell').hidden=true;$('main').hidden=false;$('main').classList.add('ready');
 hookSaved=true;globalAllowed=globalOff?false:true;systemuiSaved=true;launcherSaved=true;
 setSwitch('hook',true,false);renderGlobal({explicit:globalOff?'1':'0',allowed:!globalOff,supported:true});updateChildren();
 $('systemuiRuntime').textContent='Hook 已安装';$('launcherRuntime').textContent='等待目标进程重启';$('runtimeSummary').textContent=globalOff?'系统模糊已关闭':busy?'正在应用设置…':'Native Hook 已读取';
 $('runtimeDetails').textContent='模拟数据，仅用于界面预览';$('diagnosticsSummary').textContent='SystemUI Hook 已安装 · Launcher 等待确认';$('status').textContent='模拟预览状态\nPID 1234 · Hook 状态由模拟数据提供';
 $('diag').textContent='模拟诊断：PID 1234 · 进程启动信息已关联 · Hook installed';
 if(mode==='dialog')dialog.open();if(mode==='snackbar')toast('设置已保存');if(mode==='diagnostics'){$('diagnosticsDetails').open=true;$('viewDetails').setAttribute('aria-expanded','true')}
 if(busy){setProgress(true,'正在应用设置…');setTimeout(()=>setProgress(false),4500)}
}
async function refreshDiagnostics(){
 if(preview){renderPreview(preview);return}
 $('diag').textContent='正在读取…';try{$('diag').textContent=await sh('/system/bin/sh /data/adb/modules/pixelblur-controller/action.sh')}
 catch(e){$('diag').textContent='诊断读取失败：'+(e?.message||String(e));throw e}
}
async function refresh(full=false){
 if(preview){renderPreview(preview);return}
 if(refreshPromise){refreshAgain=true;return refreshPromise}
 refreshPromise=(async()=>{do{refreshAgain=false;try{await refreshStatus();if(full)await refreshDiagnostics()}catch(e){$('status').textContent='无法读取模块状态：'+(e?.message||String(e));throw e}}while(refreshAgain)})();
 try{return await refreshPromise}finally{refreshPromise=null}
}
async function writeAction(id,on){
 if(writeBusy)return;setBusy(true);setProgress(true,'正在应用设置…');$('runtimeSummary').textContent='正在应用设置…';
 try{
  if(id==='hook')await writeProp('persist.sys.pixelblur.hook',on);
  else if(id==='systemui')await writeProp('persist.sys.pixelblur.systemui',on);
  else if(id==='launcher')await writeProp('persist.sys.pixelblur.launcher',on);
  else if(id==='global')await sh('/system/bin/sh /data/adb/modules/pixelblur-controller/global_blur.sh set '+(on?'allow':'deny'));
  await new Promise(resolve=>setTimeout(resolve,90));
  try{await refresh()}catch(_){$('runtimeSummary').textContent='设置已保存，状态读取失败'}
  toast('设置已保存');
 }catch(e){
  if(e.timeout){$('runtimeSummary').textContent='等待回调超时，正在重新读取状态';await new Promise(resolve=>setTimeout(resolve,650));try{await refresh()}catch(_){}toast('等待命令结果超时')}
  else{try{await refresh()}catch(_){}$('runtimeSummary').textContent='设置失败';toast('设置失败')}
 }finally{setProgress(false);setBusy(false)}
}
document.querySelectorAll('.write-control').forEach(input=>input.addEventListener('change',()=>{
 if(writeBusy){refreshStatus().catch(()=>{});return}
 if(input.id==='themeAuto'){
  const follow=input.checked,p=readTheme();saveTheme(follow,p.manual);
  if(follow)syncSystemTheme().then(()=>toast('已切换为跟随系统'));
  else{setSwitch('themeAuto',false,false);setSwitch('themeDark',p.manual??document.documentElement.dataset.theme==='dark',false);$('themeState').textContent='手动使用已保存的主题';toast('已切换为手动主题')}
  return;
 }
 if(input.id==='themeDark'){
  const dark=input.checked;saveTheme(false,dark);themeSeq++;document.documentElement.dataset.theme=dark?'dark':'light';setSwitch('themeAuto',false,false);setSwitch('themeDark',dark,false);$('themeState').textContent='WebUI 主题已保存';toast(dark?'已切换为深色主题':'已切换为浅色主题');return;
 }
 if((input.id==='systemui'||input.id==='launcher')&&(globalAllowed!==true||!hookSaved)){updateChildren();return}
 writeAction(input.id,input.checked);
}));
$('blurMoreToggle').addEventListener('click',()=>{const c=$('blurMoreContent'),open=c.hidden;c.hidden=!open;$('blurMoreToggle').setAttribute('aria-expanded',String(open));});
$('refresh').addEventListener('click',async()=>{setProgress(true,'正在刷新状态与诊断…');try{await refresh(true);toast('诊断已刷新')}catch(_){toast('无法读取诊断')}finally{setProgress(false)}});
$('viewDetails').addEventListener('click',()=>{const details=$('diagnosticsDetails');details.open=!details.open;$('viewDetails').setAttribute('aria-expanded',String(details.open))});
$('restoreButton').addEventListener('click',()=>dialog.open());
$('confirmRestore').addEventListener('click',async()=>{dialog.close();if(writeBusy)return;setBusy(true);setProgress(true,'正在恢复系统设置…');try{const result=await sh('/system/bin/sh /data/adb/modules/pixelblur-controller/global_blur.sh restore');try{await refresh(true)}catch(_){$('runtimeSummary').textContent='已恢复，状态读取失败'}toast(result||'已恢复系统默认模糊设置')}catch(e){$('runtimeSummary').textContent='恢复失败';toast('恢复失败')}finally{setProgress(false);setBusy(false)}});
$('retryLoad').addEventListener('click',()=>initialize());
function revealMain(){
 stopLoadingProgress();const shell=$('loadingShell');$('main').hidden=false;$('main').classList.add('ready');shell.classList.add('loading-hidden');setTimeout(()=>shell.hidden=true,180);
}
async function initialize(){
 if(preview){renderPreview(preview);return}
 $('loadingShell').hidden=false;$('loadingError').hidden=true;$('loadingText').textContent='正在读取系统状态…';$('loadingSubtext').textContent='';startLoadingProgress();
 try{await refreshStatus();revealMain();$('loadingError').hidden=true;setProgress(false);$('runtimeSummary').textContent=$('runtimeSummary').textContent||'状态已更新'}
 catch(e){$('loadingText').textContent='无法读取模块状态';$('loadingSubtext').textContent=e?.message||'请检查 KernelSU Next 授权后重试';$('loadingError').hidden=false;setProgress(false);stopLoadingProgress()}
}
function init(){
 applyInitialTheme();const p=readTheme();if(p.follow)syncSystemTheme();else $('themeState').textContent='手动使用已保存的主题';
 setSwitch('themeAuto',p.follow,false);initialize();
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.body.classList.contains('loading-active'))scheduleLoadingProgress(loadingStartToken,$('loadingShell'));if(!document.hidden&&readTheme().follow)syncSystemTheme()});
init();
