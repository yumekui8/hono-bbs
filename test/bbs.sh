#!/bin/bash
# hono-bbs 動作確認用 CLIツール
# 人が掲示板を読み書きするためのコマンドラインツール

BASE_URL="${BASE_URL:-http://localhost:8787}"
ADMIN_API_KEY="${ADMIN_API_KEY:-}"

# ── 色定義 ──────────────────────────────────────────────
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ── ユーティリティ ──────────────────────────────────────
hr()     { printf "${DIM}%s${NC}\n" "$(printf '─%.0s' {1..54})"; }
error()  { echo -e "  ${RED}[エラー]${NC} $1"; }
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
    error "jq がインストールされていません (sudo apt install jq)"
    exit 1
  fi
}

# ── API呼び出し ──────────────────────────────────────────
api_get() {
  curl -sf "$BASE_URL$1" 2>/dev/null || echo '{"data":[]}'
}

api_post() {
  local path="$1" body="$2"
  curl -sf -X POST "$BASE_URL$path" \
    -H "Content-Type: application/json" \
    -d "$body" 2>/dev/null
}

api_post_admin() {
  local path="$1" body="$2"
  if [ -z "$ADMIN_API_KEY" ]; then
    error "ADMIN_API_KEY が未設定です (例: ADMIN_API_KEY=xxx bash test/bbs.sh)"
    return 1
  fi
  curl -sf -X POST "$BASE_URL$path" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $ADMIN_API_KEY" \
    -d "$body" 2>/dev/null
}

api_delete_admin() {
  local path="$1"
  if [ -z "$ADMIN_API_KEY" ]; then
    error "ADMIN_API_KEY が未設定です"
    return 1
  fi
  curl -sf -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL$path" \
    -H "X-API-Key: $ADMIN_API_KEY" 2>/dev/null
}

# ── 表示関数 ──────────────────────────────────────────────
show_boards() {
  header "板一覧"
  local res
  res=$(api_get "/boards")
  local count
  count=$(echo "$res" | jq '.data | length')

  if [ "$count" = "0" ]; then
    notice "板がありません"
    return
  fi

  local i=0
  while [ "$i" -lt "$count" ]; do
    local name desc created
    name=$(echo    "$res" | jq -r ".data[$i].name")
    desc=$(echo    "$res" | jq -r ".data[$i].description // \"(説明なし)\"")
    created=$(echo "$res" | jq -r ".data[$i].createdAt" | cut -c1-10)
    printf "  ${BOLD}[%d]${NC} %s\n" $((i+1)) "$name"
    printf "      ${DIM}説明: %s${NC}\n" "$desc"
    printf "      ${DIM}作成日: %s${NC}\n" "$created"
    echo ""
    i=$((i+1))
  done

  return 0
}

show_threads() {
  local board_id="$1" board_name="${2:-}"
  header "スレッド一覧${board_name:+: $board_name}"
  local res
  res=$(api_get "/boards/$board_id/threads")
  local count
  count=$(echo "$res" | jq '.data | length')

  if [ "$count" = "0" ]; then
    notice "スレッドがありません"
    return 0
  fi

  local i=0
  while [ "$i" -lt "$count" ]; do
    local title created
    title=$(echo   "$res" | jq -r ".data[$i].title")
    created=$(echo "$res" | jq -r ".data[$i].createdAt" | cut -c1-10)
    printf "  ${BOLD}[%d]${NC} %s\n" $((i+1)) "$title"
    printf "      ${DIM}作成日: %s${NC}\n" "$created"
    echo ""
    i=$((i+1))
  done

  return 0
}

show_posts() {
  local board_id="$1" thread_id="$2" thread_title="${3:-}"
  header "投稿一覧${thread_title:+: $thread_title}"
  local res
  res=$(api_get "/boards/$board_id/threads/$thread_id/posts")
  local count
  count=$(echo "$res" | jq '.data | length')

  if [ "$count" = "0" ]; then
    notice "まだ投稿がありません"
    return 0
  fi

  local i=0
  while [ "$i" -lt "$count" ]; do
    local content created
    content=$(echo "$res" | jq -r ".data[$i].content")
    # ISO8601 を "YYYY-MM-DD HH:MM" に変換
    created=$(echo "$res" | jq -r ".data[$i].createdAt" | sed 's/T/ /' | cut -c1-16)
    hr
    printf "  ${DIM}No.%d  %s${NC}\n\n" $((i+1)) "$created"
    # 長い行を折り返して表示
    echo "$content" | fold -s -w 50 | while IFS= read -r line; do
      echo "  $line"
    done
    echo ""
    i=$((i+1))
  done
  hr

  return 0
}

# ── 作成関数 ──────────────────────────────────────────────
create_board() {
  header "板を作成 (管理者)"
  if [ -z "$ADMIN_API_KEY" ]; then
    error "ADMIN_API_KEY が未設定です"
    return 1
  fi

  local name desc
  read -rp "  板の名前: " name
  [ -z "$name" ] && { error "名前は必須です"; return 1; }
  read -rp "  説明 (省略可): " desc

  local body
  if [ -z "$desc" ]; then
    body=$(jq -n --arg n "$name" '{name: $n}')
  else
    body=$(jq -n --arg n "$name" --arg d "$desc" '{name: $n, description: $d}')
  fi

  local res
  res=$(api_post_admin "/boards" "$body")
  local id
  id=$(echo "$res" | jq -r '.data.id // empty')

  if [ -z "$id" ]; then
    error "作成に失敗しました: $res"
    return 1
  fi
  echo ""
  echo -e "  ${GREEN}板を作成しました${NC}"
  printf "  名前: %s\n" "$name"
}

create_thread() {
  local board_id="$1" board_name="${2:-}"
  header "スレッドを作成${board_name:+: $board_name}"

  local title
  read -rp "  スレッドのタイトル: " title
  [ -z "$title" ] && { error "タイトルは必須です"; return 1; }

  local body
  body=$(jq -n --arg t "$title" '{title: $t}')
  local res
  res=$(api_post "/boards/$board_id/threads" "$body")
  local id
  id=$(echo "$res" | jq -r '.data.id // empty')

  if [ -z "$id" ]; then
    error "作成に失敗しました: $res"
    return 1
  fi
  echo ""
  echo -e "  ${GREEN}スレッドを作成しました${NC}"
  printf "  タイトル: %s\n" "$title"
}

create_post() {
  local board_id="$1" thread_id="$2" thread_title="${3:-}"
  header "投稿する${thread_title:+: $thread_title}"

  echo "  投稿内容を入力してください (Enterで確定):"
  read -rp "  > " content
  [ -z "$content" ] && { error "内容は必須です"; return 1; }

  local body
  body=$(jq -n --arg c "$content" '{content: $c}')
  local res
  res=$(api_post "/boards/$board_id/threads/$thread_id/posts" "$body")
  local id
  id=$(echo "$res" | jq -r '.data.id // empty')

  if [ -z "$id" ]; then
    error "投稿に失敗しました: $res"
    notice "ヒント: .dev.vars に DISABLE_RECAPTCHA=true を設定してください"
    return 1
  fi
  echo ""
  echo -e "  ${GREEN}投稿しました${NC}"
}

# ── 対話型ブラウズ ──────────────────────────────────────
browse_posts() {
  local board_id="$1" thread_id="$2" thread_title="$3"
  while true; do
    show_posts "$board_id" "$thread_id" "$thread_title"
    echo ""
    echo -e "  ${BOLD}[n]${NC} 投稿する  ${BOLD}[r]${NC} 更新  ${BOLD}[b]${NC} 戻る  ${BOLD}[q]${NC} 終了"
    read -rp "  > " choice
    case "$choice" in
      n|N) create_post "$board_id" "$thread_id" "$thread_title" ;;
      r|R) continue ;;
      b|B) return ;;
      q|Q) echo "終了します"; exit 0 ;;
    esac
  done
}

browse_threads() {
  local board_id="$1" board_name="$2"
  while true; do
    local res
    res=$(api_get "/boards/$board_id/threads")
    local count
    count=$(echo "$res" | jq '.data | length')

    show_threads "$board_id" "$board_name"
    echo ""
    echo -e "  番号でスレッドを選択  ${BOLD}[n]${NC} 新規スレッド  ${BOLD}[b]${NC} 戻る  ${BOLD}[q]${NC} 終了"
    read -rp "  > " choice

    case "$choice" in
      [1-9]*)
        local idx=$((choice-1))
        if [ "$idx" -lt "$count" ]; then
          local thread_id title
          thread_id=$(echo "$res" | jq -r ".data[$idx].id")
          title=$(echo "$res" | jq -r ".data[$idx].title")
          browse_posts "$board_id" "$thread_id" "$title"
        else
          error "無効な番号です"
        fi
        ;;
      n|N) create_thread "$board_id" "$board_name" ;;
      b|B) return ;;
      q|Q) echo "終了します"; exit 0 ;;
    esac
  done
}

browse() {
  while true; do
    local res
    res=$(api_get "/boards")
    local count
    count=$(echo "$res" | jq '.data | length')

    show_boards

    if [ -n "$ADMIN_API_KEY" ]; then
      echo -e "  番号で板を選択  ${BOLD}[n]${NC} 板を作成  ${BOLD}[q]${NC} 終了"
    else
      echo -e "  番号で板を選択  ${BOLD}[q]${NC} 終了"
      notice "  管理者機能を使うには ADMIN_API_KEY=xxx bash test/bbs.sh で起動してください"
    fi
    read -rp "  > " choice

    case "$choice" in
      [1-9]*)
        local idx=$((choice-1))
        if [ "$idx" -lt "$count" ]; then
          local board_id board_name
          board_id=$(echo "$res" | jq -r ".data[$idx].id")
          board_name=$(echo "$res" | jq -r ".data[$idx].name")
          browse_threads "$board_id" "$board_name"
        else
          error "無効な番号です"
        fi
        ;;
      n|N) create_board ;;
      q|Q) echo "終了します"; exit 0 ;;
    esac
  done
}

# ── ヘルプ ────────────────────────────────────────────────
usage() {
  cat <<EOF

使い方:
  bash test/bbs.sh [コマンド] [引数...]

コマンド:
  (なし)                          対話型ブラウズモード
                                  板 → スレッド → 投稿を選びながら閲覧・投稿
  boards                          板一覧を表示
  threads <boardId>               スレッド一覧を表示
  posts   <boardId> <threadId>    投稿一覧を表示
  write-board                     板を作成 (管理者)
  write-thread <boardId>          スレッドを作成
  write-post   <boardId> <threadId>  投稿する
  help, -h, --help                このヘルプを表示

環境変数:
  BASE_URL        APIサーバーURL (デフォルト: http://localhost:8787)
  ADMIN_API_KEY   管理者APIキー  (板の作成に必要)

実行例:
  # 対話型で掲示板を閲覧・投稿
  bash test/bbs.sh

  # 管理者機能あり（板の作成が可能）
  ADMIN_API_KEY=HOGEHOGE bash test/bbs.sh

  # 板一覧だけ表示
  bash test/bbs.sh boards

  # 特定スレッドの投稿を表示
  bash test/bbs.sh posts <boardId> <threadId>

ブラウズモードの操作:
  番号      選択 (板/スレッドを選ぶ)
  n         新規作成 (板/スレッド/投稿)
  r         更新 (投稿一覧画面のみ)
  b         戻る
  q         終了

EOF
  exit 0
}

# ── エントリポイント ──────────────────────────────────────
require_jq

case "${1:-}" in
  boards)
    show_boards
    ;;
  threads)
    [ -z "${2:-}" ] && { error "boardId が必要です"; usage; }
    show_threads "$2"
    ;;
  posts)
    [ -z "${2:-}" ] && { error "boardId が必要です"; usage; }
    [ -z "${3:-}" ] && { error "threadId が必要です"; usage; }
    show_posts "$2" "$3"
    ;;
  write-board)
    create_board
    ;;
  write-thread)
    [ -z "${2:-}" ] && { error "boardId が必要です"; usage; }
    create_thread "$2"
    ;;
  write-post)
    [ -z "${2:-}" ] && { error "boardId が必要です"; usage; }
    [ -z "${3:-}" ] && { error "threadId が必要です"; usage; }
    create_post "$2" "$3"
    ;;
  help|-h|--help)
    usage
    ;;
  "")
    browse
    ;;
  *)
    error "不明なコマンド: $1"
    usage
    ;;
esac
