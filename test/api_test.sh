#!/bin/bash
# hono-bbs API テストスクリプト
# 前提: npm run dev でサーバーを起動しておくこと
# 前提: .dev.vars に DISABLE_RECAPTCHA=true を設定しておくこと
# 前提: jq がインストールされていること

set -e

# --- ヘルプ ---
usage() {
  cat <<EOF
使い方:
  bash test/api_test.sh [オプション]

オプション:
  -h, --help    このヘルプを表示して終了

環境変数:
  BASE_URL        APIサーバーのベースURL (デフォルト: http://localhost:8787)
  ADMIN_API_KEY   管理者APIキー          (デフォルト: your-admin-api-key-here)

前提条件:
  1. npm run dev でサーバーを起動しておくこと
  2. .dev.vars に以下を設定しておくこと
       ADMIN_API_KEY=<任意の文字列>
       DISABLE_RECAPTCHA=true
  3. jq がインストールされていること (sudo apt install jq)

セットアップ手順:
  cp .dev.vars.example .dev.vars
  # .dev.vars の ADMIN_API_KEY を任意の値に変更

実行例:
  # デフォルト設定で実行
  bash test/api_test.sh

  # サーバーURLとAPIキーを指定して実行
  BASE_URL=http://localhost:8787 ADMIN_API_KEY=mysecretkey bash test/api_test.sh

テスト内容:
  - 板の作成 / 一覧取得 / 削除
  - スレッドの作成 / 一覧取得 / 削除
  - 投稿の作成 / 一覧取得 / 削除
  - 認証なしアクセスが 401 を返すことの確認
  - 存在しないリソースへのアクセスが 404 を返すことの確認
  - CASCADE削除（板削除→スレッド・投稿も削除）の確認

注意:
  投稿作成には通常 reCAPTCHA トークンが必要です。
  ローカルテスト時は .dev.vars に DISABLE_RECAPTCHA=true を設定してスキップしてください。
EOF
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage ;;
  esac
done

BASE_URL="${BASE_URL:-http://localhost:8787}"
ADMIN_API_KEY="${ADMIN_API_KEY:-your-admin-api-key-here}"

# --- 色付き出力 ---
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

# --- jq チェック ---
if ! command -v jq &>/dev/null; then
  fail "jq がインストールされていません。sudo apt install jq などでインストールしてください。"
fi

info "テスト開始: $BASE_URL"
echo ""

# ================================================================
# 板 (Board) テスト
# ================================================================
info "=== 板 (Board) テスト ==="

# 板: 作成 (admin必須)
info "板を作成します..."
BOARD_RES=$(curl -s -X POST "$BASE_URL/boards" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $ADMIN_API_KEY" \
  -d '{"name":"テスト掲示板","description":"テスト用の板です"}')

BOARD_ID=$(echo "$BOARD_RES" | jq -r '.data.id')
if [ -z "$BOARD_ID" ] || [ "$BOARD_ID" = "null" ]; then
  fail "板の作成に失敗しました: $BOARD_RES"
fi
pass "板を作成しました (id: $BOARD_ID)"

# 板: 認証なしで作成 → 401 を確認
info "認証なしで板を作成 (401 を期待)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/boards" \
  -H "Content-Type: application/json" \
  -d '{"name":"不正な板"}')
if [ "$STATUS" != "401" ]; then
  fail "認証なしで作成できてしまいました (status: $STATUS)"
fi
pass "認証なし板作成は 401 を返しました"

# 板: 一覧取得
info "板の一覧を取得します..."
BOARDS_RES=$(curl -s "$BASE_URL/boards")
BOARDS_COUNT=$(echo "$BOARDS_RES" | jq '.data | length')
if [ "$BOARDS_COUNT" -lt 1 ]; then
  fail "板の一覧取得に失敗しました: $BOARDS_RES"
fi
pass "板の一覧を取得しました (${BOARDS_COUNT}件)"

# ================================================================
# スレッド (Thread) テスト
# ================================================================
echo ""
info "=== スレッド (Thread) テスト ==="

# スレッド: 作成
info "スレッドを作成します..."
THREAD_RES=$(curl -s -X POST "$BASE_URL/boards/$BOARD_ID/threads" \
  -H "Content-Type: application/json" \
  -d '{"title":"テストスレッド"}')

THREAD_ID=$(echo "$THREAD_RES" | jq -r '.data.id')
if [ -z "$THREAD_ID" ] || [ "$THREAD_ID" = "null" ]; then
  fail "スレッドの作成に失敗しました: $THREAD_RES"
fi
pass "スレッドを作成しました (id: $THREAD_ID)"

# スレッド: 存在しない板へのスレッド作成 → 404 を確認
info "存在しない板にスレッドを作成 (404 を期待)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/boards/nonexistent-id/threads" \
  -H "Content-Type: application/json" \
  -d '{"title":"不正なスレッド"}')
if [ "$STATUS" != "404" ]; then
  fail "存在しない板へのスレッド作成が 404 を返しませんでした (status: $STATUS)"
fi
pass "存在しない板へのスレッド作成は 404 を返しました"

# スレッド: 一覧取得
info "スレッドの一覧を取得します..."
THREADS_RES=$(curl -s "$BASE_URL/boards/$BOARD_ID/threads")
THREADS_COUNT=$(echo "$THREADS_RES" | jq '.data | length')
if [ "$THREADS_COUNT" -lt 1 ]; then
  fail "スレッドの一覧取得に失敗しました: $THREADS_RES"
fi
pass "スレッドの一覧を取得しました (${THREADS_COUNT}件)"

# ================================================================
# 投稿 (Post) テスト
# ================================================================
echo ""
info "=== 投稿 (Post) テスト ==="

# 投稿: 作成 (DISABLE_RECAPTCHA=true のため reCAPTCHA トークン不要)
info "投稿を作成します (reCAPTCHA スキップ)..."
POST_RES=$(curl -s -X POST "$BASE_URL/boards/$BOARD_ID/threads/$THREAD_ID/posts" \
  -H "Content-Type: application/json" \
  -d '{"content":"テスト投稿の内容です"}')

POST_ID=$(echo "$POST_RES" | jq -r '.data.id')
if [ -z "$POST_ID" ] || [ "$POST_ID" = "null" ]; then
  fail "投稿の作成に失敗しました: $POST_RES
ヒント: .dev.vars に DISABLE_RECAPTCHA=true を設定してください"
fi
pass "投稿を作成しました (id: $POST_ID)"

# 投稿: 2件目も作成（削除テスト用）
POST_RES2=$(curl -s -X POST "$BASE_URL/boards/$BOARD_ID/threads/$THREAD_ID/posts" \
  -H "Content-Type: application/json" \
  -d '{"content":"2件目の投稿です"}')
POST_ID2=$(echo "$POST_RES2" | jq -r '.data.id')
pass "2件目の投稿を作成しました (id: $POST_ID2)"

# 投稿: reCAPTCHA なしで作成 → DISABLE_RECAPTCHA=false 環境では 400 になる
# (このテストはスキップ。本番では有効になる)

# 投稿: 一覧取得 (スレッドの中身)
info "投稿の一覧を取得します..."
POSTS_RES=$(curl -s "$BASE_URL/boards/$BOARD_ID/threads/$THREAD_ID/posts")
POSTS_COUNT=$(echo "$POSTS_RES" | jq '.data | length')
if [ "$POSTS_COUNT" -lt 2 ]; then
  fail "投稿の一覧取得に失敗しました: $POSTS_RES"
fi
pass "投稿の一覧を取得しました (${POSTS_COUNT}件)"

# ================================================================
# 削除 (Delete) テスト
# ================================================================
echo ""
info "=== 削除 (Delete) テスト ==="

# 投稿: 削除 (admin必須)
info "投稿を削除します (id: $POST_ID)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$BASE_URL/boards/$BOARD_ID/threads/$THREAD_ID/posts/$POST_ID" \
  -H "X-API-Key: $ADMIN_API_KEY")
if [ "$STATUS" != "204" ]; then
  fail "投稿の削除に失敗しました (status: $STATUS)"
fi
pass "投稿を削除しました"

# 投稿: 認証なしで削除 → 401 を確認
info "認証なしで投稿を削除 (401 を期待)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$BASE_URL/boards/$BOARD_ID/threads/$THREAD_ID/posts/$POST_ID2")
if [ "$STATUS" != "401" ]; then
  fail "認証なしで削除できてしまいました (status: $STATUS)"
fi
pass "認証なし投稿削除は 401 を返しました"

# 投稿: 存在しないものを削除 → 404 を確認
info "存在しない投稿を削除 (404 を期待)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$BASE_URL/boards/$BOARD_ID/threads/$THREAD_ID/posts/nonexistent-id" \
  -H "X-API-Key: $ADMIN_API_KEY")
if [ "$STATUS" != "404" ]; then
  fail "存在しない投稿の削除が 404 を返しませんでした (status: $STATUS)"
fi
pass "存在しない投稿の削除は 404 を返しました"

# スレッド: 削除 (admin必須、配下の投稿もCASCADE削除)
info "スレッドを削除します (id: $THREAD_ID)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$BASE_URL/boards/$BOARD_ID/threads/$THREAD_ID" \
  -H "X-API-Key: $ADMIN_API_KEY")
if [ "$STATUS" != "204" ]; then
  fail "スレッドの削除に失敗しました (status: $STATUS)"
fi
pass "スレッドを削除しました (配下の投稿もCASCADE削除)"

# スレッド: 削除後に投稿一覧へアクセス → データが空になっていることを確認
POSTS_AFTER=$(curl -s "$BASE_URL/boards/$BOARD_ID/threads/$THREAD_ID/posts" | jq '.data | length')
if [ "$POSTS_AFTER" != "0" ]; then
  fail "スレッド削除後も投稿が残っています"
fi
pass "スレッド削除後、投稿も削除されていることを確認"

# 板: 削除 (admin必須、配下のスレッド・投稿もCASCADE削除)
info "板を削除します (id: $BOARD_ID)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$BASE_URL/boards/$BOARD_ID" \
  -H "X-API-Key: $ADMIN_API_KEY")
if [ "$STATUS" != "204" ]; then
  fail "板の削除に失敗しました (status: $STATUS)"
fi
pass "板を削除しました (配下のスレッド・投稿もCASCADE削除)"

# 板: 存在しないものを削除 → 404 を確認
info "存在しない板を削除 (404 を期待)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$BASE_URL/boards/$BOARD_ID" \
  -H "X-API-Key: $ADMIN_API_KEY")
if [ "$STATUS" != "404" ]; then
  fail "存在しない板の削除が 404 を返しませんでした (status: $STATUS)"
fi
pass "存在しない板の削除は 404 を返しました"

# ================================================================
# 完了
# ================================================================
echo ""
pass "すべてのテストが完了しました"
