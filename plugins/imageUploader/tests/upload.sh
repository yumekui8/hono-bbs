#!/usr/bin/env bash
# 画像アップロードスクリプト
# 使い方:
#   bash upload.sh <ファイルパス>
#   BASE_URL=https://example.com bash upload.sh ./photo.jpg
#
# ENABLE_TURNSTILE=true の場合は TURNSTILE_SESSION も設定すること:
#   TURNSTILE_SESSION=xxx bash upload.sh ./photo.jpg

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# ---- 引数チェック ----
if [[ $# -lt 1 ]]; then
  echo "使い方: bash upload.sh <ファイルパス>"
  echo "例:     BASE_URL=http://localhost:8787 bash upload.sh ./photo.jpg"
  exit 1
fi

FILE_PATH="$1"

if [[ ! -f "$FILE_PATH" ]]; then
  echo "エラー: ファイルが見つかりません: $FILE_PATH"
  exit 1
fi

# ---- ファイル情報 ----
FILENAME=$(basename "$FILE_PATH")
FILE_SIZE=$(wc -c < "$FILE_PATH" | tr -d ' ')

# 拡張子から MIME タイプを判定
case "${FILENAME##*.}" in
  jpg|jpeg) CONTENT_TYPE="image/jpeg" ;;
  png)      CONTENT_TYPE="image/png"  ;;
  gif)      CONTENT_TYPE="image/gif"  ;;
  webp)     CONTENT_TYPE="image/webp" ;;
  *)
    echo "エラー: 対応していない拡張子です (jpg/jpeg/png/gif/webp のみ)"
    exit 1
    ;;
esac

echo "=== 画像アップロード ==="
echo "ファイル:      $FILE_PATH"
echo "ファイル名:    $FILENAME"
echo "サイズ:        $FILE_SIZE bytes"
echo "Content-Type: $CONTENT_TYPE"
echo "送信先:        $BASE_URL"
echo ""

# ---- Step 1: Presigned URL を取得 ----
info "Step 1: POST /upload/request"

REQUEST_BODY="{\"contentType\":\"$CONTENT_TYPE\",\"filename\":\"$FILENAME\",\"size\":$FILE_SIZE}"
http_request POST /upload/request "$REQUEST_BODY"

if [[ "$HTTP_STATUS" != "201" ]]; then
  fail "Presigned URL の取得に失敗 (status $HTTP_STATUS)"
  echo "  body: $HTTP_BODY"
  exit 1
fi

IMAGE_ID=$(json_field "imageId" "$HTTP_BODY")
UPLOAD_URL=$(echo "$HTTP_BODY" | grep -o '"uploadUrl":"[^"]*"' | sed 's/"uploadUrl":"//;s/"$//')
EXPIRES_AT=$(json_field "uploadUrlExpiresAt" "$HTTP_BODY")

pass "imageId: $IMAGE_ID"
info "uploadUrl: ${UPLOAD_URL:0:80}..."
info "有効期限: $EXPIRES_AT"
echo ""

# ---- Step 2: ストレージへ直接アップロード ----
info "Step 2: PUT $CONTENT_TYPE → ストレージ"

UPLOAD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PUT \
  -H "Content-Type: $CONTENT_TYPE" \
  --data-binary "@$FILE_PATH" \
  "$UPLOAD_URL")

if [[ "$UPLOAD_STATUS" == "200" ]]; then
  pass "ストレージへのアップロード成功 (status 200)"
else
  fail "ストレージへのアップロード失敗 (status $UPLOAD_STATUS)"
  echo "  Content-Type が署名済み URL と一致しているか確認してください"
  exit 1
fi
echo ""

# ---- Step 3: confirm ----
info "Step 3: POST /upload/confirm/$IMAGE_ID"

http_request POST "/upload/confirm/$IMAGE_ID" ""

if [[ "$HTTP_STATUS" != "200" ]]; then
  fail "confirm に失敗 (status $HTTP_STATUS)"
  echo "  body: $HTTP_BODY"
  exit 1
fi

PUBLIC_URL=$(echo "$HTTP_BODY" | grep -o '"url":"[^"]*"' | head -1 | sed 's/"url":"//;s/"$//')
pass "アップロード完了"
echo ""
echo "=========================================="
echo "IMAGE_ID:  $IMAGE_ID"
echo "公開 URL:  $PUBLIC_URL"
echo "=========================================="
echo ""
echo "# 削除する場合:"
echo "  BASE_URL=$BASE_URL ADMIN_API_KEY=\$ADMIN_API_KEY bash delete.sh $IMAGE_ID"
echo "# 通報する場合:"
echo "  BASE_URL=$BASE_URL bash report.sh $IMAGE_ID"
