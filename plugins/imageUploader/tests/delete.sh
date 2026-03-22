#!/usr/bin/env bash
# 画像削除スクリプト (管理者)
# 使い方:
#   bash delete.sh <imageId>
#   ADMIN_API_KEY=your-key BASE_URL=https://example.com bash delete.sh <imageId>

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# ---- 引数チェック ----
if [[ $# -lt 1 ]]; then
  echo "使い方: bash delete.sh <imageId>"
  echo "例:     ADMIN_API_KEY=your-key bash delete.sh 550e8400-e29b-41d4-a716-446655440000"
  exit 1
fi

IMAGE_ID="$1"

echo "=== 画像削除 (管理者) ==="
echo "IMAGE_ID: $IMAGE_ID"
echo "送信先:   $BASE_URL"
echo ""

# ---- 削除前に情報を確認 ----
info "削除前: GET /images/$IMAGE_ID"

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
PUBLIC_URL=$(echo "$HTTP_BODY" | grep -o '"url":"[^"]*"' | head -1 | sed 's/"url":"//;s/"$//')

info "現在のステータス: $STATUS"
info "公開 URL: $PUBLIC_URL"
echo ""

# ---- 確認プロンプト ----
read -r -p "この画像を削除しますか? [y/N]: " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "キャンセルしました"
  exit 0
fi
echo ""

# ---- 削除実行 ----
info "DELETE /images/$IMAGE_ID"

http_admin_request DELETE "/images/$IMAGE_ID"

if [[ "$HTTP_STATUS" == "204" ]]; then
  pass "削除完了 (status 204)"
else
  fail "削除に失敗 (status $HTTP_STATUS)"
  echo "  body: $HTTP_BODY"
  exit 1
fi
