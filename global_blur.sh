#!/system/bin/sh
STATE_DIR=/data/adb/pixelblur-controller
STATE_FILE=$STATE_DIR/global-blur.original
TMP_FILE=$STATE_DIR/.global-blur.original.$$
SETTINGS=/system/bin/settings
fail() { echo "ERROR: $*" >&2; exit 1; }
read_current() {
  current=$($SETTINGS get global disable_window_blurs 2>/dev/null) || return 1
  case "$current" in null|0|1) return 0 ;; *) return 1 ;; esac
}
read_record() {
  [ -f "$STATE_FILE" ] || return 1
  version=; existed=; value=
  while IFS='=' read -r key val; do
    case "$key" in
      version) [ -z "$version" ] || return 1; version=$val ;;
      existed) [ -z "$existed" ] || return 1; existed=$val ;;
      value) [ -z "$value" ] || return 1; value=$val ;;
      *) return 1 ;;
    esac
  done < "$STATE_FILE"
  [ "$version" = 1 ] || return 1
  case "$existed:$value" in 0:absent|1:0|1:1) return 0 ;; *) return 1 ;; esac
}
save_record() {
  mkdir -p "$STATE_DIR" || return 1
  chmod 0700 "$STATE_DIR" || return 1
  umask 077
  if [ "$current" = null ]; then
    printf 'version=1\nexisted=0\nvalue=absent\n' > "$TMP_FILE" || return 1
  else
    printf 'version=1\nexisted=1\nvalue=%s\n' "$current" > "$TMP_FILE" || return 1
  fi
  chmod 0600 "$TMP_FILE" && mv -f "$TMP_FILE" "$STATE_FILE" || { rm -f "$TMP_FILE"; return 1; }
}
set_value() {
  case "$1" in allow) expected=0 ;; deny) expected=1 ;; *) fail "用法：global_blur.sh set allow|deny" ;; esac
  if [ -e "$STATE_FILE" ]; then
    read_record || fail "原值记录存在但损坏，已停止写入：$STATE_FILE"
  else
    read_current || fail "无法可靠读取 disable_window_blurs，未修改设置"
    save_record || fail "无法可靠保存原值记录，未修改设置"
  fi
  $SETTINGS put global disable_window_blurs "$expected" >/dev/null 2>&1 || fail "写入失败；原值记录保留"
  read_current || fail "写入后无法读取设置；原值记录保留"
  [ "$current" = "$expected" ] || fail "写入读回不匹配；原值记录保留"
  echo "全局模糊设置已保存并验证；原值记录：$STATE_FILE"
}
restore_value() {
  [ -e "$STATE_FILE" ] || fail "没有可用的原值记录；未猜测或写入默认值"
  read_record || fail "原值记录损坏；未修改设置，记录保留：$STATE_FILE"
  if [ "$existed" = 0 ]; then
    $SETTINGS delete global disable_window_blurs >/dev/null 2>&1 || fail "删除键失败；记录保留：$STATE_FILE"
    expected=null
  else
    $SETTINGS put global disable_window_blurs "$value" >/dev/null 2>&1 || fail "恢复失败；记录保留：$STATE_FILE"
    expected=$value
  fi
  read_current || fail "恢复后读回失败；记录保留：$STATE_FILE"
  [ "$current" = "$expected" ] || fail "恢复值验证失败；记录保留：$STATE_FILE"
  echo "已恢复并验证 disable_window_blurs：$expected（原来不存在时已删除该键）"
}
case "$1" in
  set) [ -n "$2" ] || fail "缺少 allow|deny"; set_value "$2" ;;
  restore) restore_value ;;
  *) fail "用法：global_blur.sh set allow|deny | restore" ;;
esac
