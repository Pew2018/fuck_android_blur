// KernelSU Next exposes the WebUI bridge as window.ksu.
// Do not use the upstream "kernelsu" ES module here: KernelSU Next's
// WebUIInterface.exec(cmd) is synchronous and returns command stdout.
const ksuApi = window.ksu;

const $ = id => document.getElementById(id);

const toast = s => {
  const e = $('toast');
  e.textContent = s;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), 2200);
};

async function sh(cmd) {
  if (!ksuApi || typeof ksuApi.exec !== 'function') {
    throw new Error('KernelSU Next WebUI API (window.ksu.exec) 不可用');
  }

  // KernelSU Next's exec() returns stdout only. Append an explicit exit marker
  // so command failures can be reported instead of leaving the UI stuck.
  const marker = '__PIXELBLUR_EXIT__';
  const raw = String(
    ksuApi.exec(
      cmd + '; printf "\\n' + marker + '%s\\n" "$?"'
    ) ?? ''
  );

  const index = raw.lastIndexOf(marker);
  if (index < 0) {
    return raw.trim();
  }

  const stdout = raw.slice(0, index).trim();
  const exitCode = raw.slice(index + marker.length).trim();

  if (exitCode !== '0') {
    throw new Error(stdout || ('命令执行失败，exit=' + exitCode));
  }

  return stdout;
}

async function setProp(key, value) {
  await sh('setprop ' + key + ' ' + (value ? 1 : 0));
}

async function refresh() {
  $('status').textContent = '读取中…';

  try {
    const raw = await sh(
      'printf "hook=%s\\nglobal=%s\\nsystemui=%s\\nlauncher=%s\\n" ' +
      '"$(getprop persist.sys.pixelblur.hook)" ' +
      '"$(settings get global disable_window_blurs)" ' +
      '"$(getprop persist.sys.pixelblur.systemui)" ' +
      '"$(getprop persist.sys.pixelblur.launcher)"'
    );

    const m = Object.fromEntries(
      raw.split('\\n').filter(Boolean).map(x => {
        const i = x.indexOf('=');
        return i >= 0 ? [x.slice(0, i), x.slice(i + 1)] : [x, ''];
      })
    );

    $('hook').checked = m.hook === '1';
    $('global').checked = m.global === '0';
    $('systemui').checked = m.systemui !== '0';
    $('launcher').checked = m.launcher !== '0';

    $('status').textContent =
      'Native Hook       : ' + (m.hook === '1' ? 'ON (下次启动生效)' : 'OFF') + '\n' +
      'Global Blur       : ' + (m.global === '0' ? 'ON' : 'OFF') + '\n' +
      'SystemUI Blur     : ' + (m.systemui === '0' ? 'OFF' : 'ON') + '\n' +
      'Launcher / Recents: ' + (m.launcher === '0' ? 'OFF' : 'ON');

    await refreshDiagnostics();
  } catch (e) {
    $('status').textContent = '读取状态失败：' + (e?.message || String(e));
    $('diag').textContent = '状态读取命令未完成。';
  }
}

async function refreshDiagnostics() {
  $('diag').textContent = '读取中…';

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
    $('diag').textContent = '诊断读取失败：' + (e?.message || String(e));
  }
}

async function toggle(id, on) {
  try {
    if (id === 'hook') {
      await setProp('persist.sys.pixelblur.hook', on);
      toast(on ? 'Native Hook 已开启；重启后才会注入并拦截。' : 'Native Hook 已关闭；重启后完全停用。');
    } else if (id === 'global') {
      await sh('settings put global disable_window_blurs ' + (on ? 0 : 1));
      toast('Global Blur 设置已保存。');
    } else if (id === 'systemui') {
      await setProp('persist.sys.pixelblur.systemui', on);
      toast('SystemUI Blur 设置已保存；Native Hook 开启时下次启动生效。');
    } else if (id === 'launcher') {
      await setProp('persist.sys.pixelblur.launcher', on);
      toast('Launcher Blur 设置已保存；Native Hook 开启时下次启动生效。');
    }

    await refresh();
  } catch (e) {
    toast('保存失败：' + (e?.message || String(e)));
    refresh();
  }
}

$('hook').addEventListener('change', e => toggle('hook', e.target.checked));
$('global').addEventListener('change', e => toggle('global', e.target.checked));
$('systemui').addEventListener('change', e => toggle('systemui', e.target.checked));
$('launcher').addEventListener('change', e => toggle('launcher', e.target.checked));
$('refresh').addEventListener('click', refresh);

refresh();
