#!/usr/bin/env bash
# dat ファイルを hono-bbs にインポートするスクリプト
#
# 使い方:
#   ./import.sh --url <WORKER_URL> --board <BOARD_ID> --file <DAT_FILE> \
#               --admin-id <ADMIN_ID> --admin-password <PASSWORD>
#
# 例:
#   ./import.sh \
#     --url https://dat-import.example.workers.dev \
#     --board general \
#     --file ./thread12345.dat \
#     --admin-id admin \
#     --admin-password mypassword
#
# 環境変数でも設定可能:
#   DATIMPORT_URL          エンドポイント URL
#   DATIMPORT_ADMIN_ID     管理者 ID
#   DATIMPORT_PASSWORD     管理者パスワード

set -euo pipefail

# デフォルト値 (環境変数からも読み込む)
URL="${DATIMPORT_URL:-}"
BOARD_ID=""
DAT_FILE=""
ADMIN_ID="${DATIMPORT_ADMIN_ID:-}"
ADMIN_PASSWORD="${DATIMPORT_PASSWORD:-}"

usage() {
  echo "使い方: $0 --url <URL> --board <BOARD_ID> --file <DAT_FILE> --admin-id <ID> --admin-password <PASSWORD>"
  echo ""
  echo "オプション:"
  echo "  --url            dat-import Worker の URL"
  echo "  --board          インポート先の板 ID"
  echo "  --file           インポートする dat ファイルのパス (Shift-JIS)"
  echo "  --admin-id       管理者ユーザ ID"
  echo "  --admin-password 管理者パスワード"
  echo ""
  echo "環境変数: DATIMPORT_URL, DATIMPORT_ADMIN_ID, DATIMPORT_PASSWORD"
  exit 1
}

# 引数パース
while [[ $# -gt 0 ]]; do
  case $1 in
    --url)           URL="$2";            shift 2 ;;
    --board)         BOARD_ID="$2";       shift 2 ;;
    --file)          DAT_FILE="$2";       shift 2 ;;
    --admin-id)      ADMIN_ID="$2";       shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    -h|--help)       usage ;;
    *) echo "不明なオプション: $1"; usage ;;
  esac
done

# 必須パラメータチェック
if [[ -z "$URL" || -z "$BOARD_ID" || -z "$DAT_FILE" || -z "$ADMIN_ID" || -z "$ADMIN_PASSWORD" ]]; then
  echo "エラー: 必須パラメータが不足しています"
  usage
fi

if [[ ! -f "$DAT_FILE" ]]; then
  echo "エラー: ファイルが見つかりません: $DAT_FILE"
  exit 1
fi

# BASE_PATH が設定されている場合に対応 (末尾スラッシュを除去)
ENDPOINT="${URL%/}/admin/datimport"

echo "インポート開始"
echo "  URL:   $ENDPOINT"
echo "  板 ID: $BOARD_ID"
echo "  ファイル: $DAT_FILE"
echo ""

# dat ファイルをアップロード
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${ENDPOINT}?board=${BOARD_ID}" \
  -F "id=${ADMIN_ID}" \
  -F "password=${ADMIN_PASSWORD}" \
  -F "dat=@${DAT_FILE};type=application/octet-stream" \
)

HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

echo "HTTP ステータス: $HTTP_CODE"
echo "レスポンス:"
echo "$HTTP_BODY" | python3 -m json.tool 2>/dev/null || echo "$HTTP_BODY"

if [[ "$HTTP_CODE" == "201" ]]; then
  echo ""
  echo "インポート成功"
else
  echo ""
  echo "インポート失敗 (HTTP $HTTP_CODE)"
  exit 1
fi
