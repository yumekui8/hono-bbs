#!/bin/bash
# hono-bbs 動作確認用 CLIツール

BASE_URL="${BASE_URL:-http://localhost:8787}"
API_BASE_PATH="${API_BASE_PATH:-/api/v1}"
API="${BASE_URL}${API_BASE_PATH}"

# セッション情報 (ログイン後に設定)
SESSION_ID=""
SESSION_USERNAME=""
# 匿名ユーザトークン (起動時にランダム生成)
USER_TOKEN=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N)

# verboseログ設定 (-v/--verbose オプション時のみ出力)
VERBOSE=false
LOG_FILE="$(cd "$(dirname "$0")" && pwd)/bbs.sh.log"

# Turnstile セッションID (環境変数で渡す): TURNSTILE_SESSION_ID=<sessionId> bash test/bbs.sh
# または起動後に [t] メニューから対話入力できる。
# GET /auth/turnstile をブラウザで開いてチャレンジを完了するとセッションIDが表示される。
# サーバーが DISABLE_TURNSTILE=true の場合は不要。
TURNSTILE_SESSION_ID="${TURNSTILE_SESSION_ID:-}"

BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

hr()     { printf "${DIM}%s${NC}\n" "$(printf '─%.0s' {1..54})"; }
notice() { echo -e "  ${YELLOW}$1${NC}"; }

header() {
  echo ""
  hr
  echo -e "  ${BOLD}${CYAN}$1${NC}"
  hr
  echo ""
}

require_jq() {
  if ! command -v jq &>/dev/null; then
    echo -e "  ${RED}[エラー]${NC} jq がインストールされていません (sudo apt install jq)"
    exit 1
  fi
}

# APIエラーを表示する (error + message フィールドを読む)
show_api_error() {
  local res="$1" context="${2:-}"
  local err_code err_msg
  err_code=$(echo "$res" | jq -r '.error // empty' 2>/dev/null)
  err_msg=$(echo  "$res" | jq -r '.message // empty' 2>/dev/null)
  if [ -n "$err_code" ]; then
    echo -e "  ${RED}[エラー]${NC} ${context:+$context: }$err_code - $err_msg"
  else
    echo -e "  ${RED}[エラー]${NC} ${context:-リクエストに失敗しました}: $res"
  fi
}

# ── curl ラッパー ─────────────────────────────────────────
# VERBOSE=true のとき $LOG_FILE にリクエスト詳細とレスポンスを記録する
_curl() {
  if [ "$VERBOSE" = true ]; then
    local timestamp out
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    printf '\n=== %s ===\n' "$timestamp" >> "$LOG_FILE"
    # --verbose の出力 (リクエスト/レスポンスヘッダ等) を LOG_FILE へ
    # レスポンスボディは out に取得し、LOG_FILE にも書き込む
    out=$(curl --verbose "$@" 2>>"$LOG_FILE")
    printf '\n--- Response Body ---\n%s\n' "$out" >> "$LOG_FILE"
    printf '%s' "$out"
  else
    curl "$@"
  fi
}

# ── Turnstile セッション管理 ──────────────────────────────

# セッション中に Turnstile セッションIDを入力する (メニューの [t] から呼ぶ)
# ブラウザで GET /auth/turnstile を開いてチャレンジを完了するとセッションIDが表示される
do_refresh_turnstile() {
  header "Turnstile セッションID 入力"
  echo -e "  ブラウザで以下のURLを開き、チャレンジを完了してください:"
  echo -e "  ${YELLOW}$API/auth/turnstile${NC}"
  echo ""
  echo -e "  ${DIM}チャレンジ完了後にページにセッションID (UUID) が表示されます。${NC}"
  echo -e "  ${DIM}それをコピーして貼り付けてください。${NC}"
  echo ""
  read -rp "  セッションID を貼り付けてEnter (Enterでキャンセル): " new_session_id
  [ -z "$new_session_id" ] && { notice "キャンセルしました"; return; }
  TURNSTILE_SESSION_ID="$new_session_id"
  echo -e "  ${GREEN}Turnstile セッションIDを設定しました${NC}"
}

# ── API呼び出し ──────────────────────────────────────────
api_get() {
  local headers=()
  [ -n "$SESSION_ID" ] && headers+=(-H "X-Session-Id: $SESSION_ID")
  _curl -s "${headers[@]}" "$API$1" 2>/dev/null || echo '{}'
}

api_post() {
  local path="$1" body="$2"
  local headers=(-H "Content-Type: application/json" -H "X-User-Token: $USER_TOKEN")
  [ -n "$SESSION_ID" ]          && headers+=(-H "X-Session-Id: $SESSION_ID")
  [ -n "$TURNSTILE_SESSION_ID" ] && headers+=(-H "X-Turnstile-Session: $TURNSTILE_SESSION_ID")
  _curl -s -X POST "${headers[@]}" "$API$path" -d "$body" 2>/dev/null
}

api_put() {
  local path="$1" body="$2"
  local headers=(-H "Content-Type: application/json" -H "X-User-Token: $USER_TOKEN")
  [ -n "$SESSION_ID" ]          && headers+=(-H "X-Session-Id: $SESSION_ID")
  [ -n "$TURNSTILE_SESSION_ID" ] && headers+=(-H "X-Turnstile-Session: $TURNSTILE_SESSION_ID")
  _curl -s -X PUT "${headers[@]}" "$API$path" -d "$body" 2>/dev/null
}

api_delete() {
  local path="$1"
  local headers=()
  [ -n "$SESSION_ID" ]          && headers+=(-H "X-Session-Id: $SESSION_ID")
  [ -n "$TURNSTILE_SESSION_ID" ] && headers+=(-H "X-Turnstile-Session: $TURNSTILE_SESSION_ID")
  _curl -s -o /dev/null -w "%{http_code}" -X DELETE "${headers[@]}" "$API$path" 2>/dev/null
}

# ── ログイン情報表示 ──────────────────────────────────────
show_login_status() {
  if [ -n "$SESSION_ID" ]; then
    echo -e "  ${GREEN}ログイン中: $SESSION_USERNAME${NC}"
  else
    echo -e "  ${DIM}未ログイン (匿名トークン: ${USER_TOKEN:0:8}...)${NC}"
  fi
}

# ── 表示関数 ──────────────────────────────────────────────
show_boards() {
  header "板一覧"
  local res count
  res=$(api_get "/boards")
  count=$(echo "$res" | jq '.data | length' 2>/dev/null)

  if [ -z "$count" ] || [ "$count" = "null" ]; then
    show_api_error "$res" "板一覧の取得"
    return 1
  fi
  if [ "$count" = "0" ]; then
    notice "板がありません"
    return 0
  fi

  local i=0
  while [ "$i" -lt "$count" ]; do
    local name desc created id_format max_threads poster_name
    name=$(echo         "$res" | jq -r ".data[$i].name")
    desc=$(echo         "$res" | jq -r ".data[$i].description // \"(説明なし)\"")
    created=$(echo      "$res" | jq -r ".data[$i].createdAt" | cut -c1-10)
    id_format=$(echo    "$res" | jq -r ".data[$i].defaultIdFormat")
    max_threads=$(echo  "$res" | jq -r ".data[$i].maxThreads")
    poster_name=$(echo  "$res" | jq -r ".data[$i].defaultPosterName")
    printf "  ${BOLD}[%d]${NC} %s\n" $((i+1)) "$name"
    printf "      ${DIM}説明: %s${NC}\n" "$desc"
    printf "      ${DIM}IDフォーマット: %s  デフォルト投稿者名: %s  最大スレッド数: %s  作成日: %s${NC}\n" \
      "$id_format" "$poster_name" "$max_threads" "$created"
    echo ""
    i=$((i+1))
  done
}

show_threads() {
  local board_id="$1" board_name="${2:-}"
  local res
  res=$(api_get "/boards/$board_id/threads")

  # レスポンス形式: { data: { board, threads } }
  local board_name_res
  board_name_res=$(echo "$res" | jq -r '.data.board.name // empty' 2>/dev/null)
  header "スレッド一覧${board_name_res:+: $board_name_res}"

  # 板メタ情報を表示
  local board_desc board_id_format board_poster_name board_max_threads board_max_posts
  board_desc=$(echo        "$res" | jq -r '.data.board.description // "(説明なし)"')
  board_id_format=$(echo   "$res" | jq -r '.data.board.defaultIdFormat // "-"')
  board_poster_name=$(echo "$res" | jq -r '.data.board.defaultPosterName // "-"')
  board_max_threads=$(echo "$res" | jq -r '.data.board.maxThreads // "-"')
  board_max_posts=$(echo   "$res" | jq -r '.data.board.defaultMaxPosts // "-"')
  echo -e "  ${DIM}[板情報] 説明: $board_desc${NC}"
  echo -e "  ${DIM}         IDフォーマット: $board_id_format  投稿者名: $board_poster_name  最大スレッド: $board_max_threads  最大投稿: $board_max_posts${NC}"
  echo ""

  local count
  count=$(echo "$res" | jq '.data.threads | length' 2>/dev/null)
  if [ -z "$count" ] || [ "$count" = "null" ]; then
    show_api_error "$res" "スレッド一覧の取得"
    return 1
  fi
  if [ "$count" = "0" ]; then
    notice "スレッドがありません"
    return 0
  fi

  local i=0
  while [ "$i" -lt "$count" ]; do
    local title post_count updated id_format
    title=$(echo      "$res" | jq -r ".data.threads[$i].title")
    post_count=$(echo "$res" | jq -r ".data.threads[$i].postCount")
    updated=$(echo    "$res" | jq -r ".data.threads[$i].updatedAt" | cut -c1-16 | sed 's/T/ /')
    id_format=$(echo  "$res" | jq -r ".data.threads[$i].idFormat // \"(板のデフォルト)\"")
    printf "  ${BOLD}[%d]${NC} %s\n" $((i+1)) "$title"
    printf "      ${DIM}投稿数: %s  更新: %s  IDフォーマット: %s${NC}\n" "$post_count" "$updated" "$id_format"
    echo ""
    i=$((i+1))
  done
}

show_posts() {
  local board_id="$1" thread_id="$2" thread_title="${3:-}"
  local res
  # GET /boards/:boardId/threads/:threadId で thread + posts を取得
  res=$(api_get "/boards/$board_id/threads/$thread_id")

  local thread_title_res
  thread_title_res=$(echo "$res" | jq -r '.data.thread.title // empty' 2>/dev/null)
  header "投稿一覧${thread_title_res:+: $thread_title_res}"

  # スレッドメタ情報を表示
  local th_post_count th_max_posts th_id_format th_poster_name
  th_post_count=$(echo  "$res" | jq -r '.data.thread.postCount // "-"')
  th_max_posts=$(echo   "$res" | jq -r '.data.thread.maxPosts // "(板のデフォルト)"')
  th_id_format=$(echo   "$res" | jq -r '.data.thread.idFormat // "(板のデフォルト)"')
  th_poster_name=$(echo "$res" | jq -r '.data.thread.posterName // "(板のデフォルト)"')
  echo -e "  ${DIM}[スレッド情報] 投稿数: $th_post_count  最大投稿数: $th_max_posts  IDフォーマット: $th_id_format  投稿者名: $th_poster_name${NC}"
  echo ""

  local count
  count=$(echo "$res" | jq '.data.posts | length' 2>/dev/null)
  if [ -z "$count" ] || [ "$count" = "null" ]; then
    show_api_error "$res" "投稿の取得"
    return 1
  fi
  if [ "$count" = "0" ]; then
    notice "まだ投稿がありません"
    return 0
  fi

  hr
  local i=0
  while [ "$i" -lt "$count" ]; do
    local post_num poster display_id sub_info content created
    post_num=$(echo   "$res" | jq -r ".data.posts[$i].postNumber")
    poster=$(echo     "$res" | jq -r ".data.posts[$i].posterName")
    display_id=$(echo "$res" | jq -r ".data.posts[$i].displayUserId")
    sub_info=$(echo   "$res" | jq -r ".data.posts[$i].posterSubInfo // \"\"")
    content=$(echo    "$res" | jq -r ".data.posts[$i].content")
    created=$(echo    "$res" | jq -r ".data.posts[$i].createdAt" | sed 's/T/ /' | cut -c1-16)

    local id_str=""
    [ -n "$display_id" ] && id_str=" ID:${display_id}"
    local sub_str=""
    [ -n "$sub_info" ] && sub_str=" [${sub_info}]"

    printf "  ${DIM}No.%d  %s%s%s  %s${NC}\n" \
      "$post_num" "$poster" "$sub_str" "$id_str" "$created"
    echo ""
    echo "$content" | fold -s -w 50 | while IFS= read -r line; do
      echo "  $line"
    done
    echo ""
    hr
    i=$((i+1))
  done
}

# ── Identity / ユーザ・グループ確認 ──────────────────────
show_me() {
  [ -z "$SESSION_ID" ] && { notice "ログインしてください"; return; }
  header "自分のユーザ情報"
  local res
  res=$(api_get "/identity/user/me")
  local id username primary_group_id created_at
  id=$(echo "$res" | jq -r '.data.id // empty')
  if [ -z "$id" ]; then
    show_api_error "$res" "ユーザ情報の取得"
    return 1
  fi
  username=$(echo       "$res" | jq -r '.data.username')
  primary_group_id=$(echo "$res" | jq -r '.data.primaryGroupId // "(なし)"')
  created_at=$(echo     "$res" | jq -r '.data.createdAt' | cut -c1-10)
  echo -e "  ${BOLD}ID:${NC}             $id"
  echo -e "  ${BOLD}ユーザ名:${NC}       $username"
  echo -e "  ${BOLD}プライマリグループ:${NC} $primary_group_id"
  echo -e "  ${BOLD}作成日:${NC}         $created_at"
}

show_users() {
  [ -z "$SESSION_ID" ] && { notice "ログインしてください"; return; }
  header "ユーザ一覧 (userAdminGroup のみ)"
  local res count
  res=$(api_get "/identity/user")
  count=$(echo "$res" | jq '.data | length' 2>/dev/null)
  if [ -z "$count" ] || [ "$count" = "null" ]; then
    show_api_error "$res" "ユーザ一覧の取得"
    return 1
  fi
  if [ "$count" = "0" ]; then
    notice "ユーザがいません"
    return 0
  fi
  local i=0
  while [ "$i" -lt "$count" ]; do
    local uid uname pgroup created
    uid=$(echo     "$res" | jq -r ".data[$i].id")
    uname=$(echo   "$res" | jq -r ".data[$i].username")
    pgroup=$(echo  "$res" | jq -r ".data[$i].primaryGroupId // \"(なし)\"")
    created=$(echo "$res" | jq -r ".data[$i].createdAt" | cut -c1-10)
    printf "  ${BOLD}[%d]${NC} %s\n" $((i+1)) "$uname"
    printf "      ${DIM}id: %s${NC}\n" "$uid"
    printf "      ${DIM}primaryGroup: %s  作成日: %s${NC}\n" "$pgroup" "$created"
    echo ""
    i=$((i+1))
  done
}

show_groups() {
  [ -z "$SESSION_ID" ] && { notice "ログインしてください"; return; }
  header "グループ一覧"
  local res count
  res=$(api_get "/identity/group")
  count=$(echo "$res" | jq '.data | length' 2>/dev/null)
  if [ -z "$count" ] || [ "$count" = "null" ]; then
    show_api_error "$res" "グループ一覧の取得"
    return 1
  fi
  if [ "$count" = "0" ]; then
    notice "グループがありません"
    return 0
  fi
  local i=0
  while [ "$i" -lt "$count" ]; do
    local gid gname created
    gid=$(echo     "$res" | jq -r ".data[$i].id")
    gname=$(echo   "$res" | jq -r ".data[$i].name")
    created=$(echo "$res" | jq -r ".data[$i].createdAt" | cut -c1-10)
    printf "  ${BOLD}[%d]${NC} %s\n" $((i+1)) "$gname"
    printf "      ${DIM}id: %s  作成日: %s${NC}\n" "$gid" "$created"
    echo ""
    i=$((i+1))
  done
}

show_user_detail() {
  [ -z "$SESSION_ID" ] && { notice "ログインしてください"; return; }
  local user_id="$1"
  local res
  res=$(api_get "/identity/user/$user_id")
  local id username primary_group_id created_at
  id=$(echo "$res" | jq -r '.data.id // empty')
  if [ -z "$id" ]; then
    show_api_error "$res" "ユーザ情報の取得"
    return 1
  fi
  username=$(echo       "$res" | jq -r '.data.username')
  primary_group_id=$(echo "$res" | jq -r '.data.primaryGroupId // "(なし)"')
  created_at=$(echo     "$res" | jq -r '.data.createdAt' | cut -c1-10)
  echo -e "  ${BOLD}ID:${NC}             $id"
  echo -e "  ${BOLD}ユーザ名:${NC}       $username"
  echo -e "  ${BOLD}プライマリグループ:${NC} $primary_group_id"
  echo -e "  ${BOLD}作成日:${NC}         $created_at"
}

# ── 作成関数 ──────────────────────────────────────────────
create_board() {
  header "板を作成 (bbsAdminGroup)"
  if [ -z "$SESSION_ID" ]; then
    echo -e "  ${RED}[エラー]${NC} ログインが必要です (bbsAdminGroup メンバーとしてログインしてください)"
    return 1
  fi

  local board_id name desc id_format max_threads default_max_posts poster_name

  read -rp "  板のID (省略=UUID自動生成): " board_id
  read -rp "  板の名前: " name
  [ -z "$name" ] && { echo -e "  ${RED}[エラー]${NC} 名前は必須です"; return 1; }
  read -rp "  説明 (省略可): " desc
  read -rp "  デフォルト投稿者名 (省略=名無し): " poster_name
  read -rp "  最大スレッド数 (省略=1000): " max_threads
  read -rp "  デフォルト最大投稿数 (省略=1000): " default_max_posts

  echo "  IDフォーマット:"
  echo "    1) daily_hash (全員: 日毎ハッシュ)"
  echo "    2) daily_hash_or_user (匿名: 日毎ハッシュ / ログイン: ユーザID)"
  echo "    3) api_key_hash (全員: トークンハッシュ)"
  echo "    4) api_key_hash_or_user (匿名: トークンハッシュ / ログイン: ユーザID)"
  echo "    5) none (表示なし)"
  read -rp "  選択 [1-5, デフォルト=1]: " fmt_choice
  case "${fmt_choice:-1}" in
    2) id_format="daily_hash_or_user" ;;
    3) id_format="api_key_hash" ;;
    4) id_format="api_key_hash_or_user" ;;
    5) id_format="none" ;;
    *) id_format="daily_hash" ;;
  esac

  local body
  body=$(jq -n \
    --arg bid "$board_id" \
    --arg n "$name" \
    --arg d "$desc" \
    --arg f "$id_format" \
    --arg pn "$poster_name" \
    --arg mt "$max_threads" \
    --arg mp "$default_max_posts" \
    '{name: $n, defaultIdFormat: $f} |
     if $bid != "" then . + {id: $bid} else . end |
     if $d   != "" then . + {description: $d} else . end |
     if $pn  != "" then . + {defaultPosterName: $pn} else . end |
     if $mt  != "" then . + {maxThreads: ($mt | tonumber)} else . end |
     if $mp  != "" then . + {defaultMaxPosts: ($mp | tonumber)} else . end')

  local res id
  res=$(api_post "/boards" "$body")
  id=$(echo "$res" | jq -r '.data.id // empty')
  if [ -z "$id" ]; then
    show_api_error "$res" "板の作成"
    return 1
  fi
  echo -e "  ${GREEN}板を作成しました${NC}: $name (id: $id  IDフォーマット: $id_format)"
}

# 板のメタ情報変更
update_board() {
  local board_id="$1" board_name="${2:-$1}"
  header "板を編集: $board_name"

  # 現在の情報を取得
  local res
  res=$(api_get "/boards")
  local cur_name cur_desc cur_max_threads cur_max_posts cur_poster_name cur_id_format
  cur_name=$(echo        "$res" | jq -r ".data[] | select(.id == \"$board_id\") | .name")
  cur_desc=$(echo        "$res" | jq -r ".data[] | select(.id == \"$board_id\") | .description // \"\"")
  cur_max_threads=$(echo "$res" | jq -r ".data[] | select(.id == \"$board_id\") | .maxThreads")
  cur_max_posts=$(echo   "$res" | jq -r ".data[] | select(.id == \"$board_id\") | .defaultMaxPosts")
  cur_poster_name=$(echo "$res" | jq -r ".data[] | select(.id == \"$board_id\") | .defaultPosterName")
  cur_id_format=$(echo   "$res" | jq -r ".data[] | select(.id == \"$board_id\") | .defaultIdFormat")

  echo -e "  ${DIM}現在の値を表示中。Enterで変更なし${NC}"
  echo ""

  local name desc max_threads default_max_posts poster_name id_format
  read -rp "  板の名前 [$cur_name]: " name
  read -rp "  説明 [$cur_desc]: " desc
  read -rp "  最大スレッド数 [$cur_max_threads]: " max_threads
  read -rp "  デフォルト最大投稿数 [$cur_max_posts]: " default_max_posts
  read -rp "  デフォルト投稿者名 [$cur_poster_name]: " poster_name
  echo "  IDフォーマット (現在: $cur_id_format):"
  echo "    1) daily_hash  2) daily_hash_or_user  3) api_key_hash  4) api_key_hash_or_user  5) none  Enter=変更なし"
  read -rp "  選択: " fmt_choice
  case "$fmt_choice" in
    1) id_format="daily_hash" ;;
    2) id_format="daily_hash_or_user" ;;
    3) id_format="api_key_hash" ;;
    4) id_format="api_key_hash_or_user" ;;
    5) id_format="none" ;;
    *) id_format="" ;;
  esac

  local body
  body=$(jq -n \
    --arg n  "$name" \
    --arg d  "$desc" \
    --arg mt "$max_threads" \
    --arg mp "$default_max_posts" \
    --arg pn "$poster_name" \
    --arg f  "$id_format" \
    '{} |
     if $n  != "" then . + {name: $n}                              else . end |
     if $d  != "" then . + {description: $d}                       else . end |
     if $mt != "" then . + {maxThreads: ($mt | tonumber)}          else . end |
     if $mp != "" then . + {defaultMaxPosts: ($mp | tonumber)}     else . end |
     if $pn != "" then . + {defaultPosterName: $pn}                else . end |
     if $f  != "" then . + {defaultIdFormat: $f}                   else . end')

  if [ "$body" = '{}' ]; then
    notice "変更なし"
    return
  fi

  local update_res
  update_res=$(api_put "/boards/$board_id" "$body")
  local updated_id
  updated_id=$(echo "$update_res" | jq -r '.data.id // empty')
  if [ -z "$updated_id" ]; then
    show_api_error "$update_res" "板の更新"
  else
    echo -e "  ${GREEN}板を更新しました${NC}"
  fi
}

# 板削除
delete_board() {
  local board_id="$1" board_name="${2:-$1}"
  header "板を削除: $board_name"
  echo -e "  ${RED}警告:${NC} 板「$board_name」とすべてのスレッド・投稿が削除されます"
  read -rp "  本当に削除しますか? (yes/no): " confirm
  [ "$confirm" != "yes" ] && { notice "キャンセルしました"; return 1; }

  local status
  status=$(api_delete "/boards/$board_id")
  case "$status" in
    204) echo -e "  ${GREEN}板を削除しました${NC}" ; return 0 ;;
    401) echo -e "  ${RED}[エラー]${NC} ログインが必要です" ;;
    403) echo -e "  ${RED}[エラー]${NC} 権限がありません (板の所有者または bbsAdminGroup が必要)" ;;
    404) echo -e "  ${RED}[エラー]${NC} 板が見つかりません" ;;
    *)   echo -e "  ${RED}[エラー]${NC} 削除に失敗しました (status: $status)" ;;
  esac
  return 1
}

create_thread() {
  local board_id="$1" board_name="${2:-}"
  header "スレッドを作成${board_name:+: $board_name}"

  local title content poster_name
  read -rp "  スレッドタイトル: " title
  [ -z "$title" ] && { echo -e "  ${RED}[エラー]${NC} タイトルは必須です"; return 1; }
  echo "  最初の投稿内容 (Enterで確定):"
  read -rp "  > " content
  [ -z "$content" ] && { echo -e "  ${RED}[エラー]${NC} 投稿内容は必須です"; return 1; }
  read -rp "  投稿者名 (空欄=デフォルト): " poster_name

  local body
  body=$(jq -n \
    --arg t "$title" \
    --arg c "$content" \
    --arg n "$poster_name" \
    '{title: $t, content: $c} |
     if $n != "" then . + {posterName: $n} else . end')

  local res id
  res=$(api_post "/boards/$board_id/threads" "$body")
  id=$(echo "$res" | jq -r '.data.thread.id // empty')
  if [ -z "$id" ]; then
    show_api_error "$res" "スレッドの作成"
    notice "ヒント: .dev.vars に DISABLE_TURNSTILE=true を設定してください"
    return 1
  fi
  echo -e "  ${GREEN}スレッドを作成しました${NC}: $title"
}

# スレッドのメタ情報変更
update_thread() {
  local board_id="$1" thread_id="$2" thread_title="${3:-$2}"
  header "スレッドを編集: $thread_title"

  # 現在の情報を取得
  local res
  res=$(api_get "/boards/$board_id/threads/$thread_id")
  local cur_title cur_max_posts cur_poster_name cur_id_format
  cur_title=$(echo      "$res" | jq -r '.data.thread.title // ""')
  cur_max_posts=$(echo  "$res" | jq -r '.data.thread.maxPosts // "(板のデフォルト)"')
  cur_poster_name=$(echo "$res" | jq -r '.data.thread.posterName // "(板のデフォルト)"')
  cur_id_format=$(echo  "$res" | jq -r '.data.thread.idFormat // "(板のデフォルト)"')

  echo -e "  ${DIM}現在の値を表示中。Enterで変更なし / 'null'で板のデフォルトに戻す${NC}"
  echo ""

  local title max_posts poster_name id_format
  read -rp "  タイトル [$cur_title]: " title
  read -rp "  最大投稿数 [$cur_max_posts] (null=板のデフォルト): " max_posts
  read -rp "  投稿者名 [$cur_poster_name] (null=板のデフォルト): " poster_name
  echo "  IDフォーマット (現在: $cur_id_format):"
  echo "    1) daily_hash  2) daily_hash_or_user  3) api_key_hash  4) api_key_hash_or_user  5) none  n) null(板のデフォルト)  Enter=変更なし"
  read -rp "  選択: " fmt_choice
  case "$fmt_choice" in
    1) id_format="daily_hash" ;;
    2) id_format="daily_hash_or_user" ;;
    3) id_format="api_key_hash" ;;
    4) id_format="api_key_hash_or_user" ;;
    5) id_format="none" ;;
    n|N) id_format="__null__" ;;
    *) id_format="" ;;
  esac

  local body
  body=$(jq -n \
    --arg t  "$title" \
    --arg mp "$max_posts" \
    --arg pn "$poster_name" \
    --arg f  "$id_format" \
    '{} |
     if $t  != ""           then . + {title: $t}                          else . end |
     if $mp == "null"       then . + {maxPosts: null}
     elif $mp != ""         then . + {maxPosts: ($mp | tonumber)}         else . end |
     if $pn == "null"       then . + {posterName: null}
     elif $pn != ""         then . + {posterName: $pn}                    else . end |
     if $f  == "__null__"   then . + {idFormat: null}
     elif $f != ""          then . + {idFormat: $f}                       else . end')

  if [ "$body" = '{}' ]; then
    notice "変更なし"
    return
  fi

  local update_res
  update_res=$(api_put "/boards/$board_id/threads/$thread_id" "$body")
  local updated_id
  updated_id=$(echo "$update_res" | jq -r '.data.id // empty')
  if [ -z "$updated_id" ]; then
    show_api_error "$update_res" "スレッドの更新"
  else
    echo -e "  ${GREEN}スレッドを更新しました${NC}"
  fi
}

# スレッド削除
delete_thread() {
  local board_id="$1" thread_id="$2" thread_title="${3:-$2}"
  header "スレッドを削除: $thread_title"
  echo -e "  ${RED}警告:${NC} スレッド「$thread_title」とすべての投稿が削除されます"
  read -rp "  本当に削除しますか? (yes/no): " confirm
  [ "$confirm" != "yes" ] && { notice "キャンセルしました"; return 1; }

  local status
  status=$(api_delete "/boards/$board_id/threads/$thread_id")
  case "$status" in
    204) echo -e "  ${GREEN}スレッドを削除しました${NC}" ; return 0 ;;
    401) echo -e "  ${RED}[エラー]${NC} ログインが必要です" ;;
    403) echo -e "  ${RED}[エラー]${NC} 権限がありません" ;;
    404) echo -e "  ${RED}[エラー]${NC} スレッドが見つかりません" ;;
    *)   echo -e "  ${RED}[エラー]${NC} 削除に失敗しました (status: $status)" ;;
  esac
  return 1
}

create_post() {
  local board_id="$1" thread_id="$2" thread_title="${3:-}"
  header "投稿する${thread_title:+: $thread_title}"
  show_login_status
  echo ""

  local poster_name sub_info content
  read -rp "  投稿者名 (空欄=デフォルト): " poster_name
  read -rp "  サブ情報 (sage等, 省略可): " sub_info
  echo "  投稿内容 (Enterで確定):"
  read -rp "  > " content
  [ -z "$content" ] && { echo -e "  ${RED}[エラー]${NC} 内容は必須です"; return 1; }

  local body
  body=$(jq -n \
    --arg c "$content" \
    --arg n "$poster_name" \
    --arg s "$sub_info" \
    '{content: $c} |
     if $n != "" then . + {posterName: $n} else . end |
     if $s != "" then . + {posterSubInfo: $s} else . end')

  local res id
  res=$(api_post "/boards/$board_id/threads/$thread_id/posts" "$body")
  id=$(echo "$res" | jq -r '.data.id // empty')
  if [ -z "$id" ]; then
    show_api_error "$res" "投稿"
    notice "ヒント: .dev.vars に DISABLE_TURNSTILE=true を設定してください"
    return 1
  fi
  local display_id post_num
  display_id=$(echo "$res" | jq -r '.data.displayUserId')
  post_num=$(echo "$res" | jq -r '.data.postNumber')
  echo -e "  ${GREEN}投稿しました${NC} (No.$post_num  ID: $display_id)"
}

# 投稿削除 (post_id 直指定)
delete_post_by_id() {
  local board_id="$1" thread_id="$2" post_id="$3" post_num="${4:-}"
  local status
  status=$(api_delete "/boards/$board_id/threads/$thread_id/posts/$post_id")
  case "$status" in
    204) echo -e "  ${GREEN}No.${post_num:-?} を削除しました${NC}" ;;
    401) echo -e "  ${RED}[エラー]${NC} ログインが必要です" ;;
    403) echo -e "  ${RED}[エラー]${NC} 権限がありません" ;;
    404) echo -e "  ${RED}[エラー]${NC} 投稿が見つかりません" ;;
    *)   echo -e "  ${RED}[エラー]${NC} 削除に失敗しました (status: $status)" ;;
  esac
}

# ── ログイン/ログアウト ───────────────────────────────────
do_login() {
  header "ログイン"
  local username password
  read -rp "  ユーザ名: " username
  read -srp "  パスワード: " password
  echo ""
  [ -z "$username" ] || [ -z "$password" ] && { echo -e "  ${RED}[エラー]${NC} ユーザ名とパスワードは必須です"; return 1; }

  local body res session_id uname
  body=$(jq -n --arg u "$username" --arg p "$password" '{username: $u, password: $p}')
  local ts_header=()
  [ -n "$TURNSTILE_SESSION_ID" ] && ts_header+=(-H "X-Turnstile-Session: $TURNSTILE_SESSION_ID")
  res=$(_curl -s -X POST "$API/auth/signin" -H "Content-Type: application/json" "${ts_header[@]}" -d "$body" 2>/dev/null)
  session_id=$(echo "$res" | jq -r '.data.sessionId // empty')
  uname=$(echo "$res" | jq -r '.data.username // empty')

  if [ -z "$session_id" ]; then
    show_api_error "$res" "ログイン"
    return 1
  fi
  SESSION_ID="$session_id"
  SESSION_USERNAME="$uname"
  echo -e "  ${GREEN}ログインしました: $uname${NC}"
}

do_register() {
  header "ユーザ登録"
  local username password
  read -rp "  ユーザ名 (英数字・_・-): " username
  read -srp "  パスワード (8文字以上): " password
  echo ""

  local body res id primary_group_id
  body=$(jq -n --arg u "$username" --arg p "$password" '{username: $u, password: $p}')
  local ts_header=()
  [ -n "$TURNSTILE_SESSION_ID" ] && ts_header+=(-H "X-Turnstile-Session: $TURNSTILE_SESSION_ID")
  res=$(_curl -s -X POST "$API/auth/signup" -H "Content-Type: application/json" "${ts_header[@]}" -d "$body" 2>/dev/null)
  id=$(echo "$res" | jq -r '.data.id // empty')
  if [ -z "$id" ]; then
    show_api_error "$res" "ユーザ登録"
    return 1
  fi
  primary_group_id=$(echo "$res" | jq -r '.data.primaryGroupId // "(なし)"')
  echo -e "  ${GREEN}ユーザを登録しました: $username${NC}"
  echo -e "  ${DIM}プライマリグループ: $primary_group_id${NC}"
  notice "続けてログインしてください"
}

do_logout() {
  [ -z "$SESSION_ID" ] && { notice "ログインしていません"; return; }
  _curl -s -X POST "$API/auth/logout" -H "X-Session-Id: $SESSION_ID" -o /dev/null 2>/dev/null
  SESSION_ID=""
  SESSION_USERNAME=""
  echo -e "  ${GREEN}ログアウトしました${NC}"
}

do_change_password() {
  [ -z "$SESSION_ID" ] && { notice "ログインしてください"; return; }
  header "パスワード変更"
  local cur_pw new_pw
  read -srp "  現在のパスワード: " cur_pw; echo ""
  read -srp "  新しいパスワード (8文字以上): " new_pw; echo ""
  [ -z "$cur_pw" ] || [ -z "$new_pw" ] && { echo -e "  ${RED}[エラー]${NC} パスワードは必須です"; return 1; }

  local me_res user_id
  me_res=$(api_get "/identity/user/me")
  user_id=$(echo "$me_res" | jq -r '.data.id // empty')
  [ -z "$user_id" ] && { show_api_error "$me_res" "ユーザ情報取得"; return 1; }

  local body res
  body=$(jq -n --arg cp "$cur_pw" --arg np "$new_pw" '{currentPassword: $cp, newPassword: $np}')
  local ts_header=()
  [ -n "$TURNSTILE_SESSION_ID" ] && ts_header+=(-H "X-Turnstile-Session: $TURNSTILE_SESSION_ID")
  local status
  status=$(_curl -s -o /dev/null -w "%{http_code}" -X PUT "$API/identity/user/$user_id/password" \
    -H "Content-Type: application/json" -H "X-Session-Id: $SESSION_ID" "${ts_header[@]}" -d "$body" 2>/dev/null)
  case "$status" in
    204) echo -e "  ${GREEN}パスワードを変更しました${NC}" ;;
    400) echo -e "  ${RED}[エラー]${NC} 現在のパスワードが違います" ;;
    *)   echo -e "  ${RED}[エラー]${NC} 失敗しました (status: $status)" ;;
  esac
}

# ── 対話型ブラウズ ──────────────────────────────────────
browse_posts() {
  local board_id="$1" thread_id="$2" thread_title="$3"
  while true; do
    show_posts "$board_id" "$thread_id" "$thread_title"
    echo ""
    if [ -n "$SESSION_ID" ]; then
      echo -e "  ${BOLD}[n]${NC} 投稿する  ${BOLD}[d]${NC} 投稿削除  ${BOLD}[r]${NC} 更新  ${BOLD}[t]${NC} Turnstile更新  ${BOLD}[b]${NC} 戻る  ${BOLD}[q]${NC} 終了"
    else
      echo -e "  ${BOLD}[n]${NC} 投稿する  ${BOLD}[r]${NC} 更新  ${BOLD}[t]${NC} Turnstile更新  ${BOLD}[b]${NC} 戻る  ${BOLD}[q]${NC} 終了"
    fi
    read -rp "  > " choice
    case "$choice" in
      n|N) create_post "$board_id" "$thread_id" "$thread_title" ;;
      d|D)
        if [ -z "$SESSION_ID" ]; then
          echo -e "  ${RED}[エラー]${NC} ログインが必要です"
        else
          local del_res del_count
          del_res=$(api_get "/boards/$board_id/threads/$thread_id")
          del_count=$(echo "$del_res" | jq '.data.posts | length' 2>/dev/null)
          if [ -z "$del_count" ] || [ "$del_count" = "0" ]; then
            notice "削除できる投稿がありません"
          else
            echo ""
            local i=0
            while [ "$i" -lt "$del_count" ]; do
              local pnum pid poster pcreated
              pnum=$(echo    "$del_res" | jq -r ".data.posts[$i].postNumber")
              pid=$(echo     "$del_res" | jq -r ".data.posts[$i].id")
              poster=$(echo  "$del_res" | jq -r ".data.posts[$i].posterName")
              pcreated=$(echo "$del_res" | jq -r ".data.posts[$i].createdAt" | cut -c1-16 | sed 's/T/ /')
              printf "  No.%s  %s  %s  (id: %s...)\n" "$pnum" "$poster" "$pcreated" "${pid:0:8}"
              i=$((i+1))
            done
            echo ""
            read -rp "  削除するNo.を入力 (Enterでキャンセル): " del_num
            if [ -n "$del_num" ]; then
              local del_id
              del_id=$(echo "$del_res" | jq -r ".data.posts[] | select(.postNumber == ($del_num | tonumber)) | .id" 2>/dev/null)
              if [ -z "$del_id" ]; then
                echo -e "  ${RED}[エラー]${NC} No.$del_num が見つかりません"
              else
                delete_post_by_id "$board_id" "$thread_id" "$del_id" "$del_num"
              fi
            fi
          fi
        fi ;;
      r|R) continue ;;
      t|T) do_refresh_turnstile ;;
      b|B) return ;;
      q|Q) echo "終了します"; exit 0 ;;
    esac
  done
}

browse_threads() {
  local board_id="$1" board_name="$2"
  while true; do
    local res count
    res=$(api_get "/boards/$board_id/threads")
    count=$(echo "$res" | jq '.data.threads | length' 2>/dev/null)
    show_threads "$board_id" "$board_name"

    if [ -n "$SESSION_ID" ]; then
      echo -e "  番号: スレッド選択  ${BOLD}[e番号]${NC} スレッド編集  ${BOLD}[d番号]${NC} スレッド削除"
      echo -e "  ${BOLD}[n]${NC} 新規スレッド  ${BOLD}[t]${NC} Turnstile更新  ${BOLD}[b]${NC} 戻る  ${BOLD}[q]${NC} 終了"
    else
      echo -e "  番号でスレッドを選択  ${BOLD}[n]${NC} 新規スレッド  ${BOLD}[t]${NC} Turnstile更新  ${BOLD}[b]${NC} 戻る  ${BOLD}[q]${NC} 終了"
    fi
    read -rp "  > " choice

    case "$choice" in
      [1-9]*)
        local idx=$((choice-1))
        if [ -n "$count" ] && [ "$idx" -lt "$count" ]; then
          local tid title
          tid=$(echo   "$res" | jq -r ".data.threads[$idx].id")
          title=$(echo "$res" | jq -r ".data.threads[$idx].title")
          browse_posts "$board_id" "$tid" "$title"
        else
          echo -e "  ${RED}[エラー]${NC} 無効な番号です"
        fi ;;
      e[1-9]*)
        local num="${choice:1}" idx
        idx=$((num-1))
        if [ -n "$count" ] && [ "$idx" -lt "$count" ]; then
          local tid title
          tid=$(echo   "$res" | jq -r ".data.threads[$idx].id")
          title=$(echo "$res" | jq -r ".data.threads[$idx].title")
          update_thread "$board_id" "$tid" "$title"
        else
          echo -e "  ${RED}[エラー]${NC} 無効な番号です"
        fi ;;
      d[1-9]*)
        local num="${choice:1}" idx
        idx=$((num-1))
        if [ -n "$count" ] && [ "$idx" -lt "$count" ]; then
          local tid title
          tid=$(echo   "$res" | jq -r ".data.threads[$idx].id")
          title=$(echo "$res" | jq -r ".data.threads[$idx].title")
          if delete_thread "$board_id" "$tid" "$title"; then
            break  # 削除後はスレッド一覧を更新 (次ループで再取得)
          fi
        else
          echo -e "  ${RED}[エラー]${NC} 無効な番号です"
        fi ;;
      n|N) create_thread "$board_id" "$board_name" ;;
      t|T) do_refresh_turnstile ;;
      b|B) return ;;
      q|Q) echo "終了します"; exit 0 ;;
    esac
  done
}

# ユーザ・グループ情報メニュー
browse_identity() {
  while true; do
    header "ユーザ・グループ管理"
    show_login_status
    echo ""
    echo -e "  ${BOLD}[m]${NC} 自分の情報  ${BOLD}[u]${NC} ユーザ一覧 (adminのみ)  ${BOLD}[g]${NC} グループ一覧"
    echo -e "  ${BOLD}[p]${NC} パスワード変更  ${BOLD}[b]${NC} 戻る"
    read -rp "  > " choice
    case "$choice" in
      m|M) show_me ;;
      u|U) show_users ;;
      g|G) show_groups ;;
      p|P) do_change_password ;;
      b|B) return ;;
    esac
  done
}

browse() {
  while true; do
    local res count
    res=$(api_get "/boards")
    count=$(echo "$res" | jq '.data | length' 2>/dev/null)
    show_boards
    show_login_status
    echo ""
    if [ -n "$SESSION_ID" ]; then
      echo -e "  番号: 板を選択  ${BOLD}[e番号]${NC} 板を編集  ${BOLD}[d番号]${NC} 板を削除"
      echo -e "  ${BOLD}[n]${NC} 板を作成  ${BOLD}[t]${NC} Turnstile更新  ${BOLD}[i]${NC} ユーザ/グループ情報  ${BOLD}[l]${NC} ログイン/登録  ${BOLD}[L]${NC} ログアウト  ${BOLD}[q]${NC} 終了"
    else
      echo -e "  番号で板を選択  ${BOLD}[t]${NC} Turnstile更新  ${BOLD}[i]${NC} ユーザ/グループ情報  ${BOLD}[l]${NC} ログイン/登録  ${BOLD}[L]${NC} ログアウト  ${BOLD}[q]${NC} 終了"
    fi
    read -rp "  > " choice
    case "$choice" in
      [1-9]*)
        local idx=$((choice-1))
        if [ -n "$count" ] && [ "$idx" -lt "$count" ]; then
          local bid bname
          bid=$(echo   "$res" | jq -r ".data[$idx].id")
          bname=$(echo "$res" | jq -r ".data[$idx].name")
          browse_threads "$bid" "$bname"
        else
          echo -e "  ${RED}[エラー]${NC} 無効な番号です"
        fi ;;
      e[1-9]*)
        local num="${choice:1}" idx
        idx=$((num-1))
        if [ -n "$count" ] && [ "$idx" -lt "$count" ]; then
          local bid bname
          bid=$(echo   "$res" | jq -r ".data[$idx].id")
          bname=$(echo "$res" | jq -r ".data[$idx].name")
          update_board "$bid" "$bname"
        else
          echo -e "  ${RED}[エラー]${NC} 無効な番号です"
        fi ;;
      d[1-9]*)
        local num="${choice:1}" idx
        idx=$((num-1))
        if [ -n "$count" ] && [ "$idx" -lt "$count" ]; then
          local bid bname
          bid=$(echo   "$res" | jq -r ".data[$idx].id")
          bname=$(echo "$res" | jq -r ".data[$idx].name")
          delete_board "$bid" "$bname"
        else
          echo -e "  ${RED}[エラー]${NC} 無効な番号です"
        fi ;;
      n|N) create_board ;;
      t|T) do_refresh_turnstile ;;
      i|I) browse_identity ;;
      l)
        echo "  [1] ログイン  [2] 新規登録"
        read -rp "  > " lc
        case "$lc" in
          1) do_login ;;
          2) do_register ;;
        esac ;;
      L) do_logout ;;
      q|Q) echo "終了します"; exit 0 ;;
    esac
  done
}

# ── ヘルプ ────────────────────────────────────────────────
usage() {
  cat <<EOF

使い方:
  bash test/bbs.sh [-v] [コマンド] [引数...]

オプション:
  -v, --verbose   curlのリクエスト・レスポンスをログファイルに出力する
                  ログ出力先: test/bbs.sh.log

コマンド:
  (なし)                                    対話型ブラウズモード
  boards                                    板一覧
  threads <boardId>                         スレッド一覧 (板メタ情報付き)
  posts   <boardId> <threadId>              投稿一覧 (スレッドメタ情報付き)
  write-board                               板を作成 (bbsAdminGroup ログイン必須)
  update-board <boardId>                    板を編集 (ログイン必須)
  delete-board <boardId>                    板を削除 (ログイン必須)
  write-thread <boardId>                    スレッドを作成
  update-thread <boardId> <threadId>        スレッドを編集 (ログイン必須)
  delete-thread <boardId> <threadId>        スレッドを削除 (ログイン必須)
  write-post   <boardId> <threadId>         投稿する
  me                                        自分のユーザ情報 (要ログイン)
  users                                     ユーザ一覧 (userAdminGroup のみ)
  groups                                    グループ一覧 (要ログイン)
  help, -h, --help                          ヘルプ表示

環境変数:
  BASE_URL              APIサーバーURL   (デフォルト: http://localhost:8787)
  API_BASE_PATH         ベースパス       (デフォルト: /api/v1)
  TURNSTILE_SESSION_ID  Turnstile セッションID (UUID)
                        本番環境 (DISABLE_TURNSTILE=false) で POST/PUT/DELETE を
                        使う場合に必要。ブラウザで GET /auth/turnstile を開いて
                        チャレンジを完了すると表示されるセッションIDを設定する。
                        ローカル開発環境 (DISABLE_TURNSTILE=true) では不要。

  使用例:
    BASE_URL=https://hono-bbs.example.workers.dev \\
    TURNSTILE_SESSION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \\
    bash test/bbs.sh

ブラウズモードの操作:
  番号           選択 (板/スレッドを開く)
  e番号          編集 (例: e1 で1番目を編集)
  d番号          削除 (例: d2 で2番目を削除)
  n              新規作成
  t              Turnstile セッションID 入力 (全画面共通)
  i              ユーザ・グループ情報 / パスワード変更
  l              ログイン/ユーザ登録
  L              ログアウト
  d              投稿削除 (投稿一覧画面のみ)
  r              更新 (投稿一覧のみ)
  b              戻る
  q              終了

EOF
  exit 0
}

# ── エントリポイント ──────────────────────────────────────
# オプション解析 (-v/--verbose はどの位置でも指定可)
_ARGS=()
for _arg in "$@"; do
  case "$_arg" in
    -v|--verbose) VERBOSE=true ;;
    *) _ARGS+=("$_arg") ;;
  esac
done
set -- "${_ARGS[@]}"

# verbose モード時: ログファイルを初期化して開始を記録
if [ "$VERBOSE" = true ]; then
  : > "$LOG_FILE"
  printf '# bbs.sh verbose log - %s\n# LOG_FILE: %s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" "$LOG_FILE" >> "$LOG_FILE"
fi

require_jq

case "${1:-}" in
  boards)        show_boards ;;
  threads)
    [ -z "${2:-}" ] && { echo -e "  ${RED}[エラー]${NC} boardId が必要です"; usage; }
    show_threads "$2" ;;
  posts)
    [ -z "${2:-}" ] && { echo -e "  ${RED}[エラー]${NC} boardId が必要です"; usage; }
    [ -z "${3:-}" ] && { echo -e "  ${RED}[エラー]${NC} threadId が必要です"; usage; }
    show_posts "$2" "$3" ;;
  write-board)    create_board ;;
  update-board)
    [ -z "${2:-}" ] && { echo -e "  ${RED}[エラー]${NC} boardId が必要です"; usage; }
    update_board "$2" ;;
  delete-board)
    [ -z "${2:-}" ] && { echo -e "  ${RED}[エラー]${NC} boardId が必要です"; usage; }
    delete_board "$2" ;;
  write-thread)
    [ -z "${2:-}" ] && { echo -e "  ${RED}[エラー]${NC} boardId が必要です"; usage; }
    create_thread "$2" ;;
  update-thread)
    [ -z "${2:-}" ] && { echo -e "  ${RED}[エラー]${NC} boardId が必要です"; usage; }
    [ -z "${3:-}" ] && { echo -e "  ${RED}[エラー]${NC} threadId が必要です"; usage; }
    update_thread "$2" "$3" ;;
  delete-thread)
    [ -z "${2:-}" ] && { echo -e "  ${RED}[エラー]${NC} boardId が必要です"; usage; }
    [ -z "${3:-}" ] && { echo -e "  ${RED}[エラー]${NC} threadId が必要です"; usage; }
    delete_thread "$2" "$3" ;;
  write-post)
    [ -z "${2:-}" ] && { echo -e "  ${RED}[エラー]${NC} boardId が必要です"; usage; }
    [ -z "${3:-}" ] && { echo -e "  ${RED}[エラー]${NC} threadId が必要です"; usage; }
    create_post "$2" "$3" ;;
  me)      show_me ;;
  users)   show_users ;;
  groups)  show_groups ;;
  help|-h|--help) usage ;;
  "") browse ;;
  *) echo -e "  ${RED}[エラー]${NC} 不明なコマンド: $1"; usage ;;
esac
