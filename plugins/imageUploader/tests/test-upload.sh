#!/usr/bin/env bash
# アップロードフローのテスト
# POST /upload/request → (PUT to storage は省略) → POST /upload/confirm → GET /images/:id

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

echo "=== Upload Flow Tests ==="
echo "BASE_URL: $BASE_URL"
echo ""

# ---- 1. 正常系: アップロードリクエスト ----
info "1. POST /upload/request (正常)"
http_request POST /upload/request '{"contentType":"image/jpeg","filename":"test.jpg","size":1024}'

if [[ "$HTTP_STATUS" == "201" ]]; then
  pass "status 201"
  IMAGE_ID=$(json_field "imageId" "$HTTP_BODY")
  UPLOAD_URL=$(echo "$HTTP_BODY" | grep -o '"uploadUrl":"[^"]*"' | sed 's/"uploadUrl":"//;s/"//')
  info "imageId: $IMAGE_ID"
  info "uploadUrl: ${UPLOAD_URL:0:80}..."
else
  fail "status $HTTP_STATUS (expected 201)"
  echo "  body: $HTTP_BODY"
  IMAGE_ID=""
fi

# ---- 2. バリデーション: contentType 未指定 ----
info "2. POST /upload/request - contentType 未指定"
http_request POST /upload/request '{}'

if [[ "$HTTP_STATUS" == "400" ]]; then
  pass "status 400 (VALIDATION_ERROR)"
else
  fail "status $HTTP_STATUS (expected 400)"
  echo "  body: $HTTP_BODY"
fi

# ---- 3. バリデーション: 許可されていない MIME タイプ ----
info "3. POST /upload/request - 不正な contentType"
http_request POST /upload/request '{"contentType":"application/javascript"}'

if [[ "$HTTP_STATUS" == "400" ]]; then
  pass "status 400 (INVALID_CONTENT_TYPE)"
else
  fail "status $HTTP_STATUS (expected 400)"
  echo "  body: $HTTP_BODY"
fi

# ---- 4. confirm: 正常系 ----
if [[ -n "$IMAGE_ID" ]]; then
  info "4. POST /upload/confirm/$IMAGE_ID (正常)"
  http_request POST "/upload/confirm/$IMAGE_ID" ""

  if [[ "$HTTP_STATUS" == "200" ]]; then
    pass "status 200"
    STATUS=$(json_field "status" "$HTTP_BODY")
    URL=$(echo "$HTTP_BODY" | grep -o '"url":"[^"]*"' | head -1 | sed 's/"url":"//;s/"//')
    info "image.status: $STATUS"
    info "url: $URL"
    if [[ "$STATUS" == "active" ]]; then
      pass "status は active"
    else
      fail "status が active でない: $STATUS"
    fi
  else
    fail "status $HTTP_STATUS (expected 200)"
    echo "  body: $HTTP_BODY"
  fi

  # ---- 5. confirm の冪等性確認 ----
  info "5. POST /upload/confirm/$IMAGE_ID (二重 confirm は冪等に 200)"
  http_request POST "/upload/confirm/$IMAGE_ID" ""

  if [[ "$HTTP_STATUS" == "200" ]]; then
    pass "status 200 (冪等)"
  else
    fail "status $HTTP_STATUS (expected 200)"
  fi
else
  info "4-5. imageId が取得できなかったためスキップ"
fi

# ---- 6. confirm: 存在しない ID ----
info "6. POST /upload/confirm/non-existent-id (存在しない)"
http_request POST "/upload/confirm/00000000-0000-0000-0000-000000000000" ""

if [[ "$HTTP_STATUS" == "404" ]]; then
  pass "status 404"
else
  fail "status $HTTP_STATUS (expected 404)"
  echo "  body: $HTTP_BODY"
fi

# ---- 7. GET: 正常系 ----
if [[ -n "$IMAGE_ID" ]]; then
  info "7. GET /images/$IMAGE_ID"
  http_request GET "/images/$IMAGE_ID" ""

  if [[ "$HTTP_STATUS" == "200" ]]; then
    pass "status 200"
    STATUS=$(json_field "status" "$HTTP_BODY")
    info "image.status: $STATUS"
  else
    fail "status $HTTP_STATUS (expected 200)"
    echo "  body: $HTTP_BODY"
  fi
fi

# ---- 8. GET: 存在しない ID ----
info "8. GET /images/non-existent-id"
http_request GET "/images/00000000-0000-0000-0000-000000000000" ""

if [[ "$HTTP_STATUS" == "404" ]]; then
  pass "status 404"
else
  fail "status $HTTP_STATUS (expected 404)"
fi

echo ""
echo "テスト完了。IMAGE_ID=$IMAGE_ID (後続テストで使用可能)"
echo "export IMAGE_ID=$IMAGE_ID" > "$SCRIPT_DIR/.last_image_id"

exit $EXIT_CODE
