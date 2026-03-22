#!/usr/bin/env bash
# 通報機能のテスト
# POST /images/:imageId/report
#
# IMAGE_ID 環境変数が設定されていない場合は、まず新しい画像を作成して confirm する

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

echo "=== Report Tests ==="
echo ""

# IMAGE_ID が渡されていなければ新規作成
if [[ -z "${IMAGE_ID:-}" ]]; then
  if [[ -f "$SCRIPT_DIR/.last_image_id" ]]; then
    source "$SCRIPT_DIR/.last_image_id"
    info "前回のテストから IMAGE_ID を読み込み: $IMAGE_ID"
  else
    info "IMAGE_ID が未設定のため新規作成"
    http_request POST /upload/request '{"contentType":"image/jpeg","filename":"report-test.jpg"}'
    IMAGE_ID=$(json_field "imageId" "$HTTP_BODY")
    if [[ -z "$IMAGE_ID" ]]; then
      fail "画像の作成に失敗 (status $HTTP_STATUS)"
      exit 1
    fi
    http_request POST "/upload/confirm/$IMAGE_ID" ""
    info "作成した IMAGE_ID: $IMAGE_ID"
  fi
fi

# ---- 1. pending 画像への通報 (別の画像で確認) ----
info "1. POST /upload/request - pending のまま通報"
http_request POST /upload/request '{"contentType":"image/png"}'
PENDING_ID=$(json_field "imageId" "$HTTP_BODY")

if [[ -n "$PENDING_ID" ]]; then
  http_request POST "/images/$PENDING_ID/report" ""
  if [[ "$HTTP_STATUS" == "404" ]]; then
    pass "pending 画像への通報は 404"
  else
    fail "status $HTTP_STATUS (expected 404)"
    echo "  body: $HTTP_BODY"
  fi
fi

# ---- 2. 正常系: active 画像への通報 ----
info "2. POST /images/$IMAGE_ID/report (初回: active → reported)"
http_request POST "/images/$IMAGE_ID/report" ""

if [[ "$HTTP_STATUS" == "200" ]]; then
  pass "status 200"
else
  fail "status $HTTP_STATUS (expected 200)"
  echo "  body: $HTTP_BODY"
fi

# ---- 3. ステータス確認 ----
info "3. GET /images/$IMAGE_ID - status が reported になっているか確認"
http_request GET "/images/$IMAGE_ID" ""

if [[ "$HTTP_STATUS" == "200" ]]; then
  STATUS=$(json_field "status" "$HTTP_BODY")
  if [[ "$STATUS" == "reported" ]]; then
    pass "status = reported"
  else
    fail "status = $STATUS (expected reported)"
  fi
else
  fail "GET status $HTTP_STATUS"
fi

# ---- 4. 二重通報 (reported → reported, count += 1) ----
info "4. POST /images/$IMAGE_ID/report (二重通報)"
http_request POST "/images/$IMAGE_ID/report" ""

if [[ "$HTTP_STATUS" == "200" ]]; then
  pass "status 200 (二重通報も受け付ける)"
else
  fail "status $HTTP_STATUS (expected 200)"
fi

# ---- 5. 存在しない ID への通報 ----
info "5. POST /images/non-existent-id/report"
http_request POST "/images/00000000-0000-0000-0000-000000000000/report" ""

if [[ "$HTTP_STATUS" == "404" ]]; then
  pass "status 404"
else
  fail "status $HTTP_STATUS (expected 404)"
fi

echo ""
echo "export IMAGE_ID=$IMAGE_ID" > "$SCRIPT_DIR/.last_image_id"

exit $EXIT_CODE
