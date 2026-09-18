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

async function detectSystemTheme() {
  try {
    const raw = await sh(
      'mode=$(/system/bin/dumpsys uimode 2>/dev/null | ' +
      '/system/bin/grep -m 1 "mNightMode=" | /system/bin/sed "s/.*mNightMode=//;s/ .*$//"); ' +
      'computed=$(/system/bin/dumpsys uimode 2>/dev/null | ' +
      '/system/bin/grep -m 1 "mComputedNightMode=" | /system/bin/sed "s/.*mComputedNightMode=//;s/ .*$//"); ' +
      'printf "mode=%s\\ncomputed=%s\\n" "$mode" "$computed"'
    );

    const values = Object.fromEntries(
      raw.split('\n').filter(Boolean).map(line => {
        const i = line.indexOf('=');
        return i >= 0
          ? [line.slice(0, i), line.slice(i + 1)]
          : [line, ''];
      })
    );

    if (values.computed === 'true' || values.computed === 'false') {
      return {
        dark: values.computed === 'true',
        source: '系统 UiModeManager',
        mode: values.mode || 'unknown',
      };
    }
  } catch (_) {
  }

  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  return {
    dark: Boolean(media?.matches),
    source: 'WebView prefers-color-scheme',
    mode: 'fallback',
  };
}

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('themeDark').checked = dark;
}

function getStoredThemeSettings() {
  let followSystem = true;
  try {
    const stored = localStorage.getItem('pixelBlur.theme.followSystem');
    if (stored !== null) followSystem = stored !== '0';
  } catch (_) {
  }
  return { followSystem };
}

function saveThemeFollowSystem(on) {
  try {
    localStorage.setItem('pixelBlur.theme.followSystem', on ? '1' : '0');
  } catch (_) {
  }
}

function updateThemeControls(followSystem, systemState) {
  $('themeAuto').checked = followSystem;
  $('themeDark').disabled = followSystem;

  if (followSystem && systemState) {
    applyTheme(systemState.dark);
    $('themeState').textContent =
      '自动检测：手机当前为' + (systemState.dark ? '深色模式' : '浅色模式') +
      ' · ' + systemState.source;
  } else {
    $('themeState').textContent =
      '手动模式：WebUI 外观由“深色模式”开关控制';
  }
}

async function syncSystemTheme() {
  const systemState = await detectSystemTheme();
  const { followSystem } = getStoredThemeSettings();

  if (followSystem) {
    updateThemeControls(true, systemState);
  } else {
    $('themeAuto').checked = false;
    $('themeDark').disabled = false;
    $('themeState').textContent =
      '自动检测已关闭 · 手动控制 WebUI 外观';
  }

  return systemState;
}

async function toggleThemeAuto(on) {
  saveThemeFollowSystem(on);

  if (on) {
    const state = await detectSystemTheme();
    updateThemeControls(true, state);
    toast('已切换为自动跟随系统主题。');
  } else {
    const currentDark = document.documentElement.dataset.theme === 'dark';
    $('themeAuto').checked = false;
    $('themeDark').disabled = false;
    $('themeDark').checked = currentDark;
    $('themeState').textContent =
      '自动检测已关闭 · 手动控制 WebUI 外观';
    toast('已关闭自动跟随，可手动设置深色模式。');
  }
}

function toggleThemeDark(on) {
  saveThemeFollowSystem(false);
  $('themeAuto').checked = false;
  $('themeDark').disabled = false;
  applyTheme(on);
  $('themeState').textContent =
    '自动检测已关闭 · 手动控制 WebUI 外观';
  toast(on ? 'WebUI 已切换为深色模式。' : 'WebUI 已切换为浅色模式。');
}

let themePollTimer = null;

function startThemeAutoDetection() {
  clearInterval(themePollTimer);

  themePollTimer = setInterval(async () => {
    const { followSystem } = getStoredThemeSettings();
    if (!followSystem || document.hidden) return;

    try {
      const systemState = await detectSystemTheme();
      updateThemeControls(true, systemState);
    } catch (_) {
    }
  }, 10000);
}

document.addEventListener('visibilitychange', async () => {
  if (document.hidden) return;

  const { followSystem } = getStoredThemeSettings();
  if (!followSystem) return;

  try {
    const systemState = await detectSystemTheme();
    updateThemeControls(true, systemState);
  } catch (_) {
  }
});

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
      'night=$(/system/bin/dumpsys uimode 2>/dev/null | ' +
      '/system/bin/grep -m 1 "mComputedNightMode=" | ' +
      '/system/bin/sed "s/.*mComputedNightMode=//;s/ .*$//"); ' +
      'printf "Model: %s\\nBuild: %s\\nKernelSU: %s\\nSystem dark mode: %s\\n" ' +
      '"$model" "$build" "$ksu" "$night"; ' +
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

$('themeAuto').addEventListener('change', async e => {
  try {
    await toggleThemeAuto(e.target.checked);
  } catch (error) {
    toast('主题设置失败：' + (error?.message || String(error)));
    $('themeAuto').checked = true;
    try {
      await syncSystemTheme();
    } catch (_) {
    }
  }
});

$('themeDark').addEventListener('change', e => toggleThemeDark(e.target.checked));

$('blurMoreToggle').addEventListener('click', () => {
  const content = $('blurMoreContent');
  const opening = content.classList.contains('hidden');
  content.classList.toggle('hidden', !opening);
  $('blurMoreToggle').setAttribute('aria-expanded', String(opening));
  $('blurMoreIcon').textContent = opening ? '－' : '＋';
});

$('refresh').addEventListener('click', refresh);

async function initTheme() {
  // Instant visual fallback, followed by privileged system detection.
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (media) applyTheme(media.matches);

  const { followSystem } = getStoredThemeSettings();
  $('themeAuto').checked = followSystem;
  $('themeDark').disabled = followSystem;

  try {
    const systemState = await detectSystemTheme();

    if (followSystem) {
      updateThemeControls(true, systemState);
    } else {
      updateThemeControls(false, systemState);
    }
  } catch (_) {
    $('themeState').textContent =
      '系统主题检测失败 · 当前使用 WebView 主题状态';
  }

  startThemeAutoDetection();
}

(async function init() {
  await initTheme();
  await refresh();
})();
