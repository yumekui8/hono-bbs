#!/usr/bin/env bash
# レート制限のテスト
# UPLOAD_RATE_LIMIT と UPLOAD_RATE_WINDOW を設定してから実行すること
#
# 使い方:
#   UPLOAD_RATE_LIMIT=3 UPLOAD_RATE_WINDOW=1 wrangler dev &
#   bash tests/test-rate-limit.sh
#
# 注意: このテストは Worker の UPLOAD_RATE_LIMIT が 3 以下に設定されていることを前提とする
# 制限なし (0) の場合は 429 テストをスキップする

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

echo "=== Rate Limit Tests ==="
echo "注意: UPLOAD_RATE_LIMIT=3 程度の低い値で Worker を起動してからテストしてください"
echo ""

# Worker の UPLOAD_RATE_LIMIT 設定値を確認するために
# まず何度かリクエストして 429 が返るかを試す

RATE_LIMIT_HIT=false
MAX_TRIES=20

info "最大 $MAX_TRIES 回リクエストして RATE_LIMIT_EXCEEDED を確認"

for i in $(seq 1 $MAX_TRIES); do
  http_request POST /upload/request '{"contentType":"image/jpeg"}'

  if [[ "$HTTP_STATUS" == "429" ]]; then
    pass "リクエスト $i 回目で 429 RATE_LIMIT_EXCEEDED を確認"
    RATE_LIMIT_HIT=true
    break
  elif [[ "$HTTP_STATUS" == "201" ]]; then
    info "リクエスト $i 回目: 201 (成功)"
  else
    fail "予期しない status $HTTP_STATUS (リクエスト $i 回目)"
    echo "  body: $HTTP_BODY"
    break
  fi
done

if [[ "$RATE_LIMIT_HIT" == "false" ]]; then
  if [[ $MAX_TRIES -ge 20 ]]; then
    info "SKIP: $MAX_TRIES 回リクエストしても 429 にならなかった"
    info "      UPLOAD_RATE_LIMIT が 0 (無制限) または 20 より大きい値に設定されている可能性がある"
  fi
fi

exit $EXIT_CODE
