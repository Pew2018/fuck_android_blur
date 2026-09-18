// KernelSU Next exposes its WebUI bridge as window.ksu.
// Important: KernelSU Next's one-argument exec() returns only the last stdout line.
// Use the callback overload to receive complete stdout/stderr and the exit code.
const ksuApi = window.ksu;

const $ = id => document.getElementById(id);

const toast = s => {
  const e = $('toast');
  e.textContent = s;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), 2200);
};

let execSeq = 0;

function execRoot(cmd) {
  if (!ksuApi || typeof ksuApi.exec !== 'function') {
    return Promise.reject(new Error('KernelSU Next WebUI API (window.ksu.exec) 不可用'));
  }

  return new Promise((resolve, reject) => {
    const callbackName = '__pixelBlurExecCallback_' + (++execSeq);

    window[callbackName] = (code, stdout, stderr) => {
      try {
        delete window[callbackName];
      } catch (_) {
      }

      const exitCode = Number(code);
      if (exitCode === 0) {
        resolve(String(stdout || ''));
      } else {
        reject(new Error(
          String(stderr || stdout || ('命令执行失败，exit=' + exitCode))
        ));
      }
    };

    try {
      ksuApi.exec(cmd, callbackName);
    } catch (e) {
      try {
        delete window[callbackName];
      } catch (_) {
      }
      reject(e);
    }
  });
}

async function sh(cmd) {
  return (await execRoot(cmd)).trim();
}

async function setProp(key, value) {
  const expected = value ? '1' : '0';
  await sh('/system/bin/setprop ' + key + ' ' + expected);

  const actual = await sh('/system/bin/getprop ' + key);
  if (actual !== expected) {
    throw new Error(
      '写入 ' + key + ' 失败：请求=' + expected + '，实际=' + actual
    );
  }
}

async function setGlobalBlur(on) {
  const expected = on ? '0' : '1';

  await sh(
    '/system/bin/settings put global disable_window_blurs ' + expected
  );

  const actual = await sh(
    '/system/bin/settings get global disable_window_blurs'
  );

  if (actual !== expected) {
    throw new Error(
      '写入 disable_window_blurs 失败：请求=' + expected + '，实际=' + actual
    );
  }
}

async function refreshStatus() {
  const raw = await sh(
    'printf "hook=%s\\nglobal=%s\\nsystemui=%s\\nlauncher=%s\\n" ' +
    '"$(/system/bin/getprop persist.sys.pixelblur.hook)" ' +
    '"$(/system/bin/settings get global disable_window_blurs)" ' +
    '"$(/system/bin/getprop persist.sys.pixelblur.systemui)" ' +
    '"$(/system/bin/getprop persist.sys.pixelblur.launcher)"'
  );

  const m = Object.fromEntries(
    raw.split('\n').filter(Boolean).map(line => {
      const i = line.indexOf('=');
      return i >= 0
        ? [line.slice(0, i), line.slice(i + 1)]
        : [line, ''];
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
}

async function refreshDiagnostics() {
  $('diag').textContent = '读取中…';

  try {
    const diag = await sh(
      'model=$(/system/bin/getprop ro.product.model); ' +
      'build=$(/system/bin/getprop ro.build.display.id); ' +
      'ksu=$(/data/adb/ksud -V 2>/dev/null || true); ' +
      'printf "Model: %s\\nBuild: %s\\nKernelSU: %s\\n" "$model" "$build" "$ksu"; ' +
      'printf "\\nlibpixelblur injection:\\n"; ' +
      'for p in com.android.systemui com.google.android.apps.nexuslauncher; do ' +
      'pid=$(/system/bin/pidof "$p" 2>/dev/null | /system/bin/awk "{print \\$1}"); ' +
      'if [ -n "$pid" ]; then printf "%s: " "$p"; ' +
      '/system/bin/grep -q "libpixelblur.so" "/proc/$pid/maps" 2>/dev/null && ' +
      'echo "loaded" || echo "not loaded"; ' +
      'else printf "%s: not running\\n" "$p"; fi; done; ' +
      'printf "\\nNotificationShade:\\n"; ' +
      '/system/bin/dumpsys SurfaceFlinger 2>/dev/null | ' +
      '/system/bin/grep -A 10 -B 2 -E "NotificationShade#[0-9]+" | ' +
      '/system/bin/grep -E "Layer |backgroundBlurRadius=" | /system/bin/head -n 6 || true; ' +
      'printf "\\nNexusLauncherActivity:\\n"; ' +
      '/system/bin/dumpsys SurfaceFlinger 2>/dev/null | ' +
      '/system/bin/grep -A 10 -B 2 -E "NexusLauncherActivity#[0-9]+" | ' +
      '/system/bin/grep -E "Layer |backgroundBlurRadius=" | /system/bin/head -n 6 || true; ' +
      'printf "\\nHook log:\\n"; ' +
      '/system/bin/logcat -d -t 60 -s PixelBlur:I 2>/dev/null || true'
    );

    $('diag').textContent = diag || '无诊断输出';
  } catch (e) {
    $('diag').textContent = '诊断读取失败：' + (e?.message || String(e));
  }
}

async function refresh() {
  $('status').textContent = '读取中…';

  try {
    await refreshStatus();
    await refreshDiagnostics();
  } catch (e) {
    $('status').textContent = '读取状态失败：' + (e?.message || String(e));
    $('diag').textContent = '状态读取命令未完成。';
  }
}

async function toggle(id, on) {
  try {
    if (id === 'hook') {
      await setProp('persist.sys.pixelblur.hook', on);
      toast(on
        ? 'Native Hook 已开启；重启后才会注入并拦截。'
        : 'Native Hook 已关闭；重启后完全停用。');
    } else if (id === 'global') {
      await setGlobalBlur(on);
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
    try {
      await refresh();
    } catch (_) {
    }
  }
}

$('hook').addEventListener('change', e => toggle('hook', e.target.checked));
$('global').addEventListener('change', e => toggle('global', e.target.checked));
$('systemui').addEventListener('change', e => toggle('systemui', e.target.checked));
$('launcher').addEventListener('change', e => toggle('launcher', e.target.checked));
$('refresh').addEventListener('click', refresh);

refresh();
