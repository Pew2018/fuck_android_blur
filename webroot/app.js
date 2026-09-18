import { exec } from 'kernelsu';

const $ = id => document.getElementById(id);

const toast = s => {
  const e = $('toast');
  e.textContent = s;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), 2200);
};

async function sh(cmd) {
  const r = await exec(cmd);
  if (r.errno && r.errno !== 0) {
    const detail = (r.stderr || r.stdout || '').trim();
    throw new Error(detail || ('命令执行失败，errno=' + r.errno));
  }
  return (r.stdout || '').trim();
}

async function writeConfig(key, prop, value) {
  const v = value ? 1 : 0;
  await sh(
    'ksud module config set ' + key + ' ' + v +
    ' && setprop ' + prop + ' ' + v
  );
}

async function refreshStatus() {
  try {
    const raw = await sh(
      'hook_cfg="$(ksud module config get hook 2>/dev/null || true)"; ' +
      'systemui_cfg="$(ksud module config get systemui 2>/dev/null || true)"; ' +
      'launcher_cfg="$(ksud module config get launcher 2>/dev/null || true)"; ' +
      'printf "hook_cfg=%s\\nsystemui_cfg=%s\\nlauncher_cfg=%s\\n" "$hook_cfg" "$systemui_cfg" "$launcher_cfg"; ' +
      'printf "hook_prop=%s\\nsystemui_prop=%s\\nlauncher_prop=%s\\nglobal=%s\\n" ' +
      '"$(getprop persist.sys.pixelblur.hook)" ' +
      '"$(getprop persist.sys.pixelblur.systemui)" ' +
      '"$(getprop persist.sys.pixelblur.launcher)" ' +
      '"$(settings get global disable_window_blurs)"'
    );

    const m = Object.fromEntries(
      raw.split('\n').filter(Boolean).map(x => {
        const i = x.indexOf('=');
        return i >= 0 ? [x.slice(0, i), x.slice(i + 1)] : [x, ''];
      })
    );

    const hook = m.hook_cfg === '0' || m.hook_cfg === '1' ? m.hook_cfg : m.hook_prop;
    const systemui = m.systemui_cfg === '0' || m.systemui_cfg === '1'
      ? m.systemui_cfg : m.systemui_prop;
    const launcher = m.launcher_cfg === '0' || m.launcher_cfg === '1'
      ? m.launcher_cfg : m.launcher_prop;

    $('hook').checked = hook === '1';
    $('global').checked = m.global === '0';
    $('systemui').checked = systemui !== '0';
    $('launcher').checked = launcher !== '0';

    $('status').textContent =
      'Native Hook       : ' + (hook === '1' ? 'ON (下次启动生效)' : 'OFF') + '\n' +
      'Global Blur       : ' + (m.global === '0' ? 'ON' : 'OFF') + '\n' +
      'SystemUI Blur     : ' + (systemui === '0' ? 'OFF' : 'ON') + '\n' +
      'Launcher / Recents: ' + (launcher === '0' ? 'OFF' : 'ON');
  } catch (e) {
    $('status').textContent = '读取状态失败：' + e.message;
  }
}

async function refreshDiagnostics() {
  try {
    const diag = await sh(
      'model=$(getprop ro.product.model); ' +
      'build=$(getprop ro.build.display.id); ' +
      'ksu=$(ksud -V 2>/dev/null || true); ' +
      'printf "Model: %s\\nBuild: %s\\nKernelSU: %s\\n" "$model" "$build" "$ksu"; ' +
      'printf "\\nlibpixelblur injection:\\n"; ' +
      'for p in com.android.systemui com.google.android.apps.nexuslauncher; do ' +
      'pid=$(pidof "$p" 2>/dev/null | awk "{print $1}"); ' +
      'if [ -n "$pid" ]; then printf "%s: " "$p"; ' +
      'grep -q "libpixelblur.so" "/proc/$pid/maps" 2>/dev/null && echo "loaded" || echo "not loaded"; ' +
      'else printf "%s: not running\\n" "$p"; fi; done; ' +
      'printf "\\nNotificationShade:\\n"; ' +
      'dumpsys SurfaceFlinger 2>/dev/null | grep -A 10 -B 2 -E "NotificationShade#[0-9]+" | ' +
      'grep -E "Layer |backgroundBlurRadius=" | head -n 6 || true; ' +
      'printf "\\nNexusLauncherActivity:\\n"; ' +
      'dumpsys SurfaceFlinger 2>/dev/null | grep -A 10 -B 2 -E "NexusLauncherActivity#[0-9]+" | ' +
      'grep -E "Layer |backgroundBlurRadius=" | head -n 6 || true; ' +
      'printf "\\nHook log:\\n"; logcat -d -t 60 -s PixelBlur:I 2>/dev/null || true'
    );
    $('diag').textContent = diag || '无诊断输出';
  } catch (e) {
    $('diag').textContent = '诊断读取失败：' + e.message;
  }
}

async function refresh() {
  $('status').textContent = '读取中…';
  $('diag').textContent = '读取中…';
  await refreshStatus();
  refreshDiagnostics();
}

async function toggle(id, on) {
  try {
    if (id === 'hook') {
      await writeConfig('hook', 'persist.sys.pixelblur.hook', on);
      toast(on ? 'Native Hook 已开启；重启后才会注入并拦截。' : 'Native Hook 已关闭；重启后完全停用。');
    } else if (id === 'global') {
      await sh('settings put global disable_window_blurs ' + (on ? 0 : 1));
      toast('Global Blur 设置已保存。');
    } else if (id === 'systemui') {
      await writeConfig('systemui', 'persist.sys.pixelblur.systemui', on);
      toast('SystemUI Blur 设置已保存；Native Hook 开启时下次启动生效。');
    } else if (id === 'launcher') {
      await writeConfig('launcher', 'persist.sys.pixelblur.launcher', on);
      toast('Launcher Blur 设置已保存；Native Hook 开启时下次启动生效。');
    }
  } catch (e) {
    toast('保存失败：' + e.message);
  }

  setTimeout(refresh, 250);
}

$('hook').addEventListener('change', e => toggle('hook', e.target.checked));
$('global').addEventListener('change', e => toggle('global', e.target.checked));
$('systemui').addEventListener('change', e => toggle('systemui', e.target.checked));
$('launcher').addEventListener('change', e => toggle('launcher', e.target.checked));
$('refresh').addEventListener('click', refresh);

refresh();
