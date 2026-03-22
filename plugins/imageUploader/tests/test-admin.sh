#!/usr/bin/env bash
# 管理者機能のテスト
# DELETE /images/:imageId
#
# IMAGE_ID 環境変数が設定されていない場合は新規作成する

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

echo "=== Admin Tests ==="
echo ""

# ---- 1. 認証なしで DELETE ----
info "1. DELETE /images/any-id - 認証なし"
RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "${BASE_URL}/images/00000000-0000-0000-0000-000000000000")
HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
HTTP_BODY=$(echo "$RESPONSE" | head -n-1)

if [[ "$HTTP_STATUS" == "401" || "$HTTP_STATUS" == "403" ]]; then
  pass "status $HTTP_STATUS (認証エラー)"
else
  fail "status $HTTP_STATUS (expected 401 or 403)"
  echo "  body: $HTTP_BODY"
fi

# ---- 2. 不正な API キーで DELETE ----
info "2. DELETE /images/any-id - 不正な API キー"
RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE \
  -H "Authorization: Bearer invalid-key" \
  "${BASE_URL}/images/00000000-0000-0000-0000-000000000000")
HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
HTTP_BODY=$(echo "$RESPONSE" | head -n-1)

if [[ "$HTTP_STATUS" == "401" ]]; then
  pass "status 401"
else
  fail "status $HTTP_STATUS (expected 401)"
fi

# ---- 3. 存在しない画像の DELETE ----
info "3. DELETE /images/non-existent - 正しい API キー + 存在しない ID"
http_admin_request DELETE "/images/00000000-0000-0000-0000-000000000000"

if [[ "$HTTP_STATUS" == "404" ]]; then
  pass "status 404"
else
  fail "status $HTTP_STATUS (expected 404)"
  echo "  body: $HTTP_BODY"
fi

# ---- 4. 正常系: 画像を作成して削除 ----
info "4. 画像を作成して管理者削除"

# 作成
http_request POST /upload/request '{"contentType":"image/jpeg","filename":"admin-delete-test.jpg"}'
DELETE_TARGET_ID=$(json_field "imageId" "$HTTP_BODY")

if [[ -z "$DELETE_TARGET_ID" ]]; then
  fail "画像の作成に失敗 (status $HTTP_STATUS)"
else
  # confirm
  http_request POST "/upload/confirm/$DELETE_TARGET_ID" ""
  if [[ "$HTTP_STATUS" != "200" ]]; then
    fail "confirm 失敗 (status $HTTP_STATUS)"
  fi

  # DELETE
  info "DELETE /images/$DELETE_TARGET_ID"
  http_admin_request DELETE "/images/$DELETE_TARGET_ID"

  if [[ "$HTTP_STATUS" == "204" ]]; then
    pass "status 204 (削除成功)"
  else
    fail "status $HTTP_STATUS (expected 204)"
    echo "  body: $HTTP_BODY"
  fi

  # 削除後に GET → 404
  info "削除後の GET /images/$DELETE_TARGET_ID → 404 を確認"
  http_request GET "/images/$DELETE_TARGET_ID" ""

  if [[ "$HTTP_STATUS" == "404" ]]; then
    pass "削除後は 404"
  else
    fail "status $HTTP_STATUS (expected 404 after delete)"
  fi

  # 二重削除 → 404
  info "二重削除 → 404"
  http_admin_request DELETE "/images/$DELETE_TARGET_ID"

  if [[ "$HTTP_STATUS" == "404" ]]; then
    pass "二重削除は 404"
  else
    fail "status $HTTP_STATUS (expected 404)"
  fi
fi

# ---- 5. reported 画像の削除 ----
info "5. reported 状態の画像を管理者削除"

http_request POST /upload/request '{"contentType":"image/jpeg"}'
REPORTED_ID=$(json_field "imageId" "$HTTP_BODY")

if [[ -n "$REPORTED_ID" ]]; then
  http_request POST "/upload/confirm/$REPORTED_ID" ""
  http_request POST "/images/$REPORTED_ID/report" ""

  info "DELETE /images/$REPORTED_ID (reported 状態)"
  http_admin_request DELETE "/images/$REPORTED_ID"

  if [[ "$HTTP_STATUS" == "204" ]]; then
    pass "status 204 (reported 画像も削除可能)"
  else
    fail "status $HTTP_STATUS (expected 204)"
    echo "  body: $HTTP_BODY"
  fi
fi

exit $EXIT_CODE
