import { exec } from 'kernelsu';

const $ = id => document.getElementById(id);
const toast = s => {
  const e=$('toast'); e.textContent=s; e.classList.add('show');
  setTimeout(()=>e.classList.remove('show'),1800);
};

async function sh(cmd){
  const r=await exec(cmd);
  return (r.stdout || '').trim();
}

async function setProp(key,value){
  await sh('setprop '+key+' '+(value ? 1 : 0));
}

async function refresh(){
  const raw=await sh(
    'printf "global=%s\\nsystemui=%s\\nlauncher=%s\\n" '+
    '"$(settings get global disable_window_blurs)" '+
    '"$(getprop persist.sys.pixelblur.systemui)" '+
    '"$(getprop persist.sys.pixelblur.launcher)"'
  );

  const m=Object.fromEntries(
    raw.split('\\n').filter(Boolean).map(x=>x.split('='))
  );

  $('global').checked=m.global==='0';
  $('systemui').checked=m.systemui!=='0';
  $('launcher').checked=m.launcher!=='0';

  $('status').textContent=
    'Global Blur       : '+(m.global==='0'?'ON':'OFF')+'\\n'+
    'SystemUI Blur     : '+(m.systemui==='0'?'OFF':'ON')+'\\n'+
    'Launcher / Recents: '+(m.launcher==='0'?'OFF':'ON');

  const diag=await sh(
    'model=$(getprop ro.product.model); '+
    'build=$(getprop ro.build.display.id); '+
    'ksu=$(su -c "ksud -V 2>/dev/null" 2>/dev/null || true); '+
    'printf "Model: %s\\nBuild: %s\\nKernelSU: %s\\n" "$model" "$build" "$ksu"; '+
    'printf "\\nNotificationShade:\\n"; '+
    'dumpsys SurfaceFlinger 2>/dev/null | grep -A 10 -B 2 -E "NotificationShade#[0-9]+" | grep -E "Layer |backgroundBlurRadius=" | head -n 6 || true; '+
    'printf "\\nNexusLauncherActivity:\\n"; '+
    'dumpsys SurfaceFlinger 2>/dev/null | grep -A 10 -B 2 -E "NexusLauncherActivity#[0-9]+" | grep -E "Layer |backgroundBlurRadius=" | head -n 6 || true; '+
    'printf "\\nHook log:\\n"; logcat -d -t 40 -s PixelBlur:I 2>/dev/null || true'
  );

  $('diag').textContent=diag || '无诊断输出';
}

async function toggle(id,on){
  if(id==='global')
    await sh('settings put global disable_window_blurs '+(on?0:1));
  else if(id==='systemui')
    await setProp('persist.sys.pixelblur.systemui',on);
  else if(id==='launcher')
    await setProp('persist.sys.pixelblur.launcher',on);

  toast('设置已保存；重新进入对应界面即可触发新的 Blur Transaction。');
  setTimeout(refresh,250);
}

$('global').addEventListener('change',e=>toggle('global',e.target.checked));
$('systemui').addEventListener('change',e=>toggle('systemui',e.target.checked));
$('launcher').addEventListener('change',e=>toggle('launcher',e.target.checked));
$('refresh').addEventListener('click',refresh);
refresh();
