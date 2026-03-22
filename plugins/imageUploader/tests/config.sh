#!/usr/bin/env bash
# テスト設定
# このファイルを各テストスクリプトが source する

# Worker のベース URL (ローカル開発: http://localhost:8787, 本番: デプロイ先 URL)
BASE_URL="${BASE_URL:-http://localhost:8787}"

# 管理者 API キー (ADMIN_API_KEY 環境変数で渡すか、下記に直接記入する)
# 例: ADMIN_API_KEY=your-key bash test-admin.sh
ADMIN_API_KEY="${ADMIN_API_KEY:-your-admin-api-key}"

# Turnstile セッション ID (ENABLE_TURNSTILE=true の場合に必要)
# turnstileApiToken プラグインで発行したセッション ID を設定する
# ENABLE_TURNSTILE が未設定の場合は空文字列のままで OK
TURNSTILE_SESSION="${TURNSTILE_SESSION:-}"

# ---- ユーティリティ ----

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; EXIT_CODE=1; }
info() { echo -e "${YELLOW}→${NC} $1"; }

EXIT_CODE=0

# HTTP リクエストを実行して status code と body を変数に格納する
# 使い方: http_request GET /path [body]
http_request() {
  local method="$1"
  local path="$2"
  local body="$3"
  local extra_headers=()

  [[ -n "$TURNSTILE_SESSION" ]] && extra_headers+=(-H "X-Turnstile-Session: $TURNSTILE_SESSION")

  if [[ -n "$body" ]]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      "${extra_headers[@]}" \
      -d "$body" \
      "${BASE_URL}${path}")
  else
    RESPONSE=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      "${extra_headers[@]}" \
      "${BASE_URL}${path}")
  fi

  HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
  HTTP_BODY=$(echo "$RESPONSE" | head -n-1)
}

# 管理者リクエスト
http_admin_request() {
  local method="$1"
  local path="$2"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X "$method" \
    -H "Authorization: Bearer ${ADMIN_API_KEY}" \
    "${BASE_URL}${path}")

  HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
  HTTP_BODY=$(echo "$RESPONSE" | head -n-1)
}

# JSON フィールドを取得する (jq が不要な簡易実装)
# 使い方: json_field "fieldName" "$json_string"
json_field() {
  local field="$1"
  local json="$2"
  echo "$json" | grep -o "\"${field}\":\"[^\"]*\"" | head -1 | sed "s/\"${field}\":\"//;s/\"//"
}
