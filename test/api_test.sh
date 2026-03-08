#!/bin/bash
# hono-bbs API テストスクリプト
# 前提: npm run dev でサーバーを起動しておくこと
# 前提: .dev.vars に DISABLE_TURNSTILE=true を設定しておくこと
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
  BASE_URL              APIサーバーのベースURL (デフォルト: http://localhost:8787)
  API_BASE_PATH         APIベースパス          (デフォルト: /api/v1)
  ADMIN_INITIAL_PASSWORD  admin の初期パスワード (デフォルト: your-admin-initial-password-here)

前提条件:
  1. npm run dev でサーバーを起動しておくこと
  2. .dev.vars に ADMIN_INITIAL_PASSWORD=<値> / DISABLE_TURNSTILE=true を設定
  3. DBを初期化しておくこと: wrangler d1 execute hono-bbs-db --local --file=schema/init.sql
  4. jq がインストールされていること

実行例:
  ADMIN_INITIAL_PASSWORD=HOGEHOGE bash test/api_test.sh
EOF
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage ;;
  esac
done

BASE_URL="${BASE_URL:-http://localhost:8787}"
API_BASE_PATH="${API_BASE_PATH:-/api/v1}"
ADMIN_INITIAL_PASSWORD="${ADMIN_INITIAL_PASSWORD:-your-admin-initial-password-here}"
API="${BASE_URL}${API_BASE_PATH}"

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
  fail "jq がインストールされていません"
fi

info "テスト開始: $API"
echo ""

# ================================================================
# admin セットアップ
# ================================================================
info "=== admin セットアップ ==="

SETUP_RES=$(curl -s -X POST "$API/auth/setup")
SETUP_MSG=$(echo "$SETUP_RES" | jq -r '.data.message // empty')
SETUP_ERR=$(echo "$SETUP_RES" | jq -r '.error // empty')
if [ -n "$SETUP_MSG" ]; then
  pass "admin パスワードを設定しました"
elif [ "$SETUP_ERR" = "ALREADY_SETUP" ]; then
  pass "admin パスワードは既に設定済みです"
else
  fail "admin セットアップに失敗しました: $SETUP_RES"
fi

# admin ログイン
info "admin でログインします..."
ADMIN_LOGIN_RES=$(curl -s -X POST "$API/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$ADMIN_INITIAL_PASSWORD\"}")

ADMIN_SESSION_ID=$(echo "$ADMIN_LOGIN_RES" | jq -r '.data.sessionId // empty')
[ -z "$ADMIN_SESSION_ID" ] && fail "admin ログインに失敗しました: $ADMIN_LOGIN_RES"
pass "admin でログインしました (sessionId: ${ADMIN_SESSION_ID:0:8}...)"

# ================================================================
# ユーザ (User) テスト
# ================================================================
echo ""
info "=== ユーザ (User) テスト ==="

# ユーザ登録
info "ユーザを登録します..."
REG_RES=$(curl -s -X POST "$API/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}')

USER_ID=$(echo "$REG_RES" | jq -r '.data.id // empty')
[ -z "$USER_ID" ] && fail "ユーザ登録に失敗しました: $REG_RES"
pass "ユーザを登録しました (id: $USER_ID)"

# 登録時に sys-general-group がプライマリグループとして設定されているか確認
PRIMARY_GROUP_ID=$(echo "$REG_RES" | jq -r '.data.primaryGroupId // empty')
[ "$PRIMARY_GROUP_ID" != "sys-general-group" ] && fail "primaryGroupId が sys-general-group ではありません: $PRIMARY_GROUP_ID"
pass "sys-general-group がプライマリグループとして設定されました"

# 重複ユーザ登録 → 409
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}')
[ "$STATUS" != "409" ] && fail "重複登録が 409 を返しませんでした (status: $STATUS)"
pass "重複ユーザ登録は 409 を返しました"

# ログイン
info "ログインします..."
LOGIN_RES=$(curl -s -X POST "$API/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}')

SESSION_ID=$(echo "$LOGIN_RES" | jq -r '.data.sessionId // empty')
[ -z "$SESSION_ID" ] && fail "ログインに失敗しました: $LOGIN_RES"
pass "ログインしました (sessionId: ${SESSION_ID:0:8}...)"

# /identity/user/me
info "ユーザ情報を取得します..."
ME_RES=$(curl -s "$API/identity/user/me" -H "X-Session-Id: $SESSION_ID")
ME_USERNAME=$(echo "$ME_RES" | jq -r '.data.username // empty')
[ "$ME_USERNAME" != "testuser" ] && fail "/identity/user/me が正しいユーザを返しませんでした: $ME_RES"
pass "/identity/user/me でユーザ情報を取得しました"

# ================================================================
# 板 (Board) テスト
# ================================================================
echo ""
info "=== 板 (Board) テスト ==="

# 板: admin セッションで作成 (userAdminGroup 必須)
info "板を作成します (admin)..."
BOARD_RES=$(curl -s -X POST "$API/boards" \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: $ADMIN_SESSION_ID" \
  -d '{
    "id": "test-board",
    "name": "テスト掲示板",
    "description": "テスト用の板です",
    "defaultIdFormat": "daily_hash",
    "defaultPosterName": "名無しさん",
    "maxThreads": 500,
    "defaultMaxPosts": 200,
    "defaultMaxPostLength": 1000
  }')

BOARD_ID=$(echo "$BOARD_RES" | jq -r '.data.id // empty')
[ -z "$BOARD_ID" ] && fail "板の作成に失敗しました: $BOARD_RES"
[ "$BOARD_ID" != "test-board" ] && fail "カスタムIDが反映されませんでした (id: $BOARD_ID)"
pass "板を作成しました (id: $BOARD_ID)"

# メタ情報が保持されているか確認
BOARD_POSTER_NAME=$(echo "$BOARD_RES" | jq -r '.data.defaultPosterName')
[ "$BOARD_POSTER_NAME" != "名無しさん" ] && fail "defaultPosterName が保持されていません: $BOARD_POSTER_NAME"
pass "メタ情報が保持されました (defaultPosterName: $BOARD_POSTER_NAME)"

BOARD_MAX_THREADS=$(echo "$BOARD_RES" | jq -r '.data.maxThreads')
[ "$BOARD_MAX_THREADS" != "500" ] && fail "maxThreads が保持されていません: $BOARD_MAX_THREADS"
pass "メタ情報が保持されました (maxThreads: $BOARD_MAX_THREADS)"

# 所有者が admin になっているか確認
BOARD_OWNER_USER_ID=$(echo "$BOARD_RES" | jq -r '.data.ownerUserId // empty')
[ -z "$BOARD_OWNER_USER_ID" ] && fail "ownerUserId が設定されていません: $BOARD_RES"
pass "ownerUserId が設定されました (id: ${BOARD_OWNER_USER_ID:0:8}...)"

# 板: 認証なしで作成 → 401
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/boards" \
  -H "Content-Type: application/json" -d '{"name":"不正な板"}')
[ "$STATUS" != "401" ] && fail "認証なし作成が 401 を返しませんでした"
pass "認証なし板作成は 401 を返しました"

# 板: 一覧取得
BOARDS_COUNT=$(curl -s "$API/boards" | jq '.data | length')
[ "$BOARDS_COUNT" -lt 1 ] && fail "板の一覧取得に失敗しました"
pass "板の一覧を取得しました (${BOARDS_COUNT}件)"

# ================================================================
# スレッド (Thread) テスト
# ================================================================
echo ""
info "=== スレッド (Thread) テスト ==="

# スレッド: ログインユーザで作成 (title + content 必須)
info "スレッドを作成します..."
THREAD_RES=$(curl -s -X POST "$API/boards/$BOARD_ID/threads" \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: $SESSION_ID" \
  -d '{"title":"テストスレッド","content":"スレッドの最初の投稿です"}')

THREAD_ID=$(echo "$THREAD_RES" | jq -r '.data.thread.id // empty')
[ -z "$THREAD_ID" ] && fail "スレッドの作成に失敗しました: $THREAD_RES"
pass "スレッドを作成しました (id: $THREAD_ID)"

# 第1レスが一緒に作成されているか確認
FIRST_POST_ID=$(echo "$THREAD_RES" | jq -r '.data.firstPost.id // empty')
[ -z "$FIRST_POST_ID" ] && fail "第1レスが作成されていません: $THREAD_RES"
pass "第1レスが作成されました (id: $FIRST_POST_ID)"

# スレッド: content なし → 400
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/boards/$BOARD_ID/threads" \
  -H "Content-Type: application/json" -d '{"title":"タイトルのみ"}')
[ "$STATUS" != "400" ] && fail "content なしが 400 を返しませんでした (status: $STATUS)"
pass "content なしスレッド作成は 400 を返しました"

# スレッド: 存在しない板 → 404
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/boards/nonexistent/threads" \
  -H "Content-Type: application/json" -d '{"title":"不正","content":"内容"}')
[ "$STATUS" != "404" ] && fail "存在しない板へのスレッド作成が 404 を返しませんでした"
pass "存在しない板へのスレッド作成は 404 を返しました"

# スレッド: 一覧取得 (レスポンスに板メタ情報も含まれる)
info "スレッド一覧 (板メタ情報付き) を取得します..."
THREADS_RES=$(curl -s "$API/boards/$BOARD_ID/threads")
THREADS_COUNT=$(echo "$THREADS_RES" | jq '.data.threads | length')
[ "$THREADS_COUNT" -lt 1 ] && fail "スレッドの一覧取得に失敗しました"
pass "スレッドの一覧を取得しました (${THREADS_COUNT}件)"

EMBEDDED_BOARD_ID=$(echo "$THREADS_RES" | jq -r '.data.board.id // empty')
[ "$EMBEDDED_BOARD_ID" != "$BOARD_ID" ] && fail "レスポンスに板のメタ情報が含まれていません: $THREADS_RES"
pass "レスポンスに板のメタ情報が含まれています (board.id: $EMBEDDED_BOARD_ID)"

# スレッド: 存在しない板のスレッド一覧 → 404
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/boards/nonexistent/threads")
[ "$STATUS" != "404" ] && fail "存在しない板のスレッド一覧が 404 を返しませんでした"
pass "存在しない板のスレッド一覧は 404 を返しました"

# ================================================================
# 投稿 (Post) テスト
# ================================================================
echo ""
info "=== 投稿 (Post) テスト ==="

# 投稿: ログインユーザで作成
info "投稿を作成します (ログインユーザ)..."
POST_RES=$(curl -s -X POST "$API/boards/$BOARD_ID/threads/$THREAD_ID/posts" \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: $SESSION_ID" \
  -H "X-User-Token: test-token-12345" \
  -d '{"content":"ログインユーザの投稿","posterName":"テスト太郎"}')

POST_ID=$(echo "$POST_RES" | jq -r '.data.id // empty')
[ -z "$POST_ID" ] && fail "投稿の作成に失敗しました: $POST_RES
 ヒント: .dev.vars に DISABLE_TURNSTILE=true を設定してください"
pass "投稿を作成しました (id: $POST_ID)"

DISPLAY_USER_ID=$(echo "$POST_RES" | jq -r '.data.displayUserId')
POST_NUMBER=$(echo "$POST_RES" | jq -r '.data.postNumber')
pass "displayUserId: '$DISPLAY_USER_ID'  postNumber: $POST_NUMBER"

# 投稿: 匿名ユーザで作成
POST_RES2=$(curl -s -X POST "$API/boards/$BOARD_ID/threads/$THREAD_ID/posts" \
  -H "Content-Type: application/json" \
  -H "X-User-Token: anon-token-99999" \
  -d '{"content":"匿名ユーザの投稿"}')
POST_ID2=$(echo "$POST_RES2" | jq -r '.data.id // empty')
[ -z "$POST_ID2" ] && fail "匿名投稿の作成に失敗しました: $POST_RES2"
ANON_DISPLAY=$(echo "$POST_RES2" | jq -r '.data.displayUserId')
pass "匿名投稿を作成しました (displayUserId: '$ANON_DISPLAY')"

# 投稿: スレッドエンドポイントから取得 (thread + posts が返る)
info "スレッド (投稿付き) を取得します..."
THREAD_WITH_POSTS=$(curl -s "$API/boards/$BOARD_ID/threads/$THREAD_ID")
POSTS_COUNT=$(echo "$THREAD_WITH_POSTS" | jq '.data.posts | length')
# 第1レス + POST1 + POST2 = 3件以上
[ "$POSTS_COUNT" -lt 2 ] && fail "投稿の取得に失敗しました (count: $POSTS_COUNT)"
pass "投稿の一覧を取得しました (${POSTS_COUNT}件)"

EMBEDDED_THREAD_ID=$(echo "$THREAD_WITH_POSTS" | jq -r '.data.thread.id // empty')
[ "$EMBEDDED_THREAD_ID" != "$THREAD_ID" ] && fail "レスポンスにスレッドのメタ情報が含まれていません"
pass "レスポンスにスレッドのメタ情報が含まれています (thread.id: $EMBEDDED_THREAD_ID)"

# 旧 /posts エンドポイントが廃止されているか確認 → 404
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/boards/$BOARD_ID/threads/$THREAD_ID/posts")
[ "$STATUS" != "404" ] && fail "旧 GET /posts エンドポイントが廃止されていません (status: $STATUS)"
pass "旧 GET /posts エンドポイントは廃止されています (404)"

# スレッドの post_count が更新されているか確認
THREAD_POST_COUNT=$(curl -s "$API/boards/$BOARD_ID/threads" | jq ".data.threads[] | select(.id == \"$THREAD_ID\") | .postCount")
[ "$THREAD_POST_COUNT" -lt 2 ] && fail "スレッドの postCount が更新されていません"
pass "スレッドの postCount が更新されました ($THREAD_POST_COUNT)"

# ================================================================
# 削除 (Delete) テスト
# ================================================================
echo ""
info "=== 削除 (Delete) テスト ==="

# 投稿: 削除 (admin セッション)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$API/boards/$BOARD_ID/threads/$THREAD_ID/posts/$POST_ID" \
  -H "X-Session-Id: $ADMIN_SESSION_ID")
[ "$STATUS" != "204" ] && fail "投稿の削除に失敗しました (status: $STATUS)"
pass "投稿を削除しました"

# 投稿: 権限なしで削除 → 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$API/boards/$BOARD_ID/threads/$THREAD_ID/posts/$POST_ID2")
[ "$STATUS" != "403" ] && fail "権限なし削除が 403 を返しませんでした (status: $STATUS)"
pass "権限なし投稿削除は 403 を返しました"

# 投稿: 存在しないもの → 404
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$API/boards/$BOARD_ID/threads/$THREAD_ID/posts/nonexistent" \
  -H "X-Session-Id: $ADMIN_SESSION_ID")
[ "$STATUS" != "404" ] && fail "存在しない投稿削除が 404 を返しませんでした"
pass "存在しない投稿削除は 404 を返しました"

# スレッド: 削除 (admin セッション)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$API/boards/$BOARD_ID/threads/$THREAD_ID" \
  -H "X-Session-Id: $ADMIN_SESSION_ID")
[ "$STATUS" != "204" ] && fail "スレッドの削除に失敗しました (status: $STATUS)"
pass "スレッドを削除しました (CASCADE削除)"

# 板: 削除 (admin セッション)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$API/boards/$BOARD_ID" \
  -H "X-Session-Id: $ADMIN_SESSION_ID")
[ "$STATUS" != "204" ] && fail "板の削除に失敗しました (status: $STATUS)"
pass "板を削除しました (CASCADE削除)"

# 板: 存在しないもの → 404
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$API/boards/$BOARD_ID" \
  -H "X-Session-Id: $ADMIN_SESSION_ID")
[ "$STATUS" != "404" ] && fail "存在しない板削除が 404 を返しませんでした"
pass "存在しない板削除は 404 を返しました"

# ================================================================
# ログアウト
# ================================================================
echo ""
info "=== ログアウト テスト ==="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/auth/logout" \
  -H "X-Session-Id: $SESSION_ID")
[ "$STATUS" != "204" ] && fail "ログアウトに失敗しました (status: $STATUS)"
pass "ログアウトしました"

# ログアウト後に /identity/user/me → 401
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/identity/user/me" \
  -H "X-Session-Id: $SESSION_ID")
[ "$STATUS" != "401" ] && fail "ログアウト後の /identity/user/me が 401 を返しませんでした"
pass "ログアウト後の /identity/user/me は 401 を返しました"

# ================================================================
# 完了
# ================================================================
echo ""
pass "すべてのテストが完了しました"
