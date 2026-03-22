#!/usr/bin/env bash
# 画像通報スクリプト
# 使い方:
#   bash report.sh <imageId>
#   BASE_URL=https://example.com bash report.sh <imageId>

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# ---- 引数チェック ----
if [[ $# -lt 1 ]]; then
  echo "使い方: bash report.sh <imageId>"
  echo "例:     BASE_URL=http://localhost:8787 bash report.sh 550e8400-e29b-41d4-a716-446655440000"
  exit 1
fi

IMAGE_ID="$1"

echo "=== 画像通報 ==="
echo "IMAGE_ID: $IMAGE_ID"
echo "送信先:   $BASE_URL"
echo ""

# ---- 通報前に情報を確認 ----
info "通報前: GET /images/$IMAGE_ID"

http_request GET "/images/$IMAGE_ID" ""

if [[ "$HTTP_STATUS" == "404" ]]; then
  fail "画像が見つかりません (status 404)"
  exit 1
elif [[ "$HTTP_STATUS" != "200" ]]; then
  fail "情報取得に失敗 (status $HTTP_STATUS)"
  echo "  body: $HTTP_BODY"
  exit 1
fi

STATUS=$(json_field "status" "$HTTP_BODY")
REPORT_COUNT=$(echo "$HTTP_BODY" | grep -o '"reportCount":[0-9]*' | sed 's/"reportCount"://')
PUBLIC_URL=$(echo "$HTTP_BODY" | grep -o '"url":"[^"]*"' | head -1 | sed 's/"url":"//;s/"$//')

info "現在のステータス: $STATUS"
info "通報回数: ${REPORT_COUNT:-0}"
info "公開 URL: $PUBLIC_URL"
echo ""

# ---- 通報実行 ----
info "POST /images/$IMAGE_ID/report"

http_request POST "/images/$IMAGE_ID/report" ""

if [[ "$HTTP_STATUS" == "200" ]]; then
  pass "通報完了 (status 200)"
else
  fail "通報に失敗 (status $HTTP_STATUS)"
  echo "  body: $HTTP_BODY"
  exit 1
fi

echo ""

# ---- 通報後のステータス確認 ----
info "通報後: GET /images/$IMAGE_ID"

http_request GET "/images/$IMAGE_ID" ""

if [[ "$HTTP_STATUS" == "200" ]]; then
  NEW_STATUS=$(json_field "status" "$HTTP_BODY")
  NEW_COUNT=$(echo "$HTTP_BODY" | grep -o '"reportCount":[0-9]*' | sed 's/"reportCount"://')
  info "ステータス: ${STATUS} → ${NEW_STATUS}"
  info "通報回数:   ${REPORT_COUNT:-0} → ${NEW_COUNT:-0}"
fi
