# twoCh プラグイン デプロイ手順

---

## 前提条件

- hono-bbs 本体がデプロイ済みであること
- hono-bbs の D1 データベース ID が手元にあること
- Cloudflare アカウントで `wrangler` が認証済みであること
- カスタムドメインが Cloudflare の管理下にあること (ルーティング設定する場合)

---

## 手順

### 1. 依存パッケージのインストール

Shift-JIS エンコードに `encoding-japanese` を使用する。ルートの `package.json` に追加済みのため、ルートで `npm install` を実行する。

```bash
cd /path/to/hono-bbs
npm install
```

### 2. wrangler.jsonc を作成

```bash
cd plugins/twoCh
cp wrangler.example.jsonc wrangler.jsonc
```

### 3. wrangler.jsonc を編集

```jsonc
{
  "name": "two-ch",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",

  "d1_databases": [
    {
      "binding": "BBS_DB",
      "database_name": "hono-bbs-db",
      "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  // ← hono-bbs と同じ ID
    }
  ],

  // 専用ドメインを設定する場合
  "routes": [
    {
      "pattern": "2ch.example.com/*",
      "zone_name": "example.com"
    }
  ],

  "vars": {
    "SITE_URL": "https://2ch.example.com",  // ← このWorkerの公開URL
    "BBS_NAME": "掲示板",
    // 複数インスタンスで KV を共有する場合は hono-bbs 本体と同じ値を設定
    // "KV_PREFIX": "prod:"
  }
}
```

**設定項目の説明**

| 設定項目 | 必須 | 説明 |
|---|---|---|
| `d1_databases[].database_id` | ✅ | hono-bbs と **同じ** D1 データベース ID |
| `vars.SITE_URL` | | bbsmenu のリンク生成に使用。省略時はリクエストの `Host` ヘッダーから自動生成 |
| `vars.BBS_NAME` | | bbsmenu のタイトルに表示するサイト名。省略時は `掲示板` |
| `routes` | | 専用ドメインのルーティング設定。省略時は Workers のデフォルト URL で動作 |

### 4. デプロイ

```bash
cd plugins/twoCh
npx wrangler deploy
```

デプロイ後、Cloudflare ダッシュボードまたは出力に表示された URL でアクセスできる。

---

## ローカル開発

```bash
cd plugins/twoCh
npx wrangler dev
```

デフォルトで `http://localhost:8787` で起動する。

ローカル D1 を使用するため、hono-bbs 側でも同じローカル D1 にデータが入っている必要がある。

```bash
# hono-bbs ルートで D1 初期化 (未実施の場合)
cd /path/to/hono-bbs
npx wrangler d1 execute hono-bbs-db --local --file=schema/init.sql
```

---

## 動作確認

### bbsmenu.html

```bash
curl http://localhost:8787/bbsmenu.html
```

Shift-JIS の HTML が返ることを確認する。

### subject.txt

```bash
curl http://localhost:8787/{board_id}/subject.txt
```

例:
```bash
curl http://localhost:8787/general/subject.txt
```

### dat ファイル (全体取得)

```bash
curl -v http://localhost:8787/{board_id}/dat/{thread_key}.dat
```

レスポンスヘッダーに `Last-Modified` と `Accept-Ranges: bytes` が含まれることを確認する。

### dat ファイル (差分取得)

```bash
# 新着なし → 304 が返ること
curl -v \
  -H "If-Modified-Since: Sun, 22 Mar 2026 00:12:26 GMT" \
  -H "Range: bytes=1234-" \
  http://localhost:8787/{board_id}/dat/{thread_key}.dat

# 新着あり → 206 と差分データが返ること
curl -v \
  -H "Range: bytes=100-" \
  http://localhost:8787/{board_id}/dat/{thread_key}.dat

# あぼーん検出 (start >= total) → 416 が返ること
curl -v \
  -H "Range: bytes=999999-" \
  http://localhost:8787/{board_id}/dat/{thread_key}.dat
```

### 書き込み (bbs.cgi)

スクリプトでテストする場合:

```python
import requests
import urllib.parse

# 新規スレッド作成
data = {
    "bbs": "general",
    "subject": "テストスレ",
    "FROM": "",
    "mail": "",
    "MESSAGE": "本文です",
}
resp = requests.post(
    "http://localhost:8787/test/bbs.cgi",
    data=urllib.parse.urlencode(data).encode("shift_jis"),
    headers={"Content-Type": "application/x-www-form-urlencoded; charset=Shift_JIS"},
)
print(resp.text)
```

---

## 2ch ブラウザでの接続設定

### 2chMate (Android)

1. アプリ起動 → メニュー → 外部BBSを追加
2. 以下を入力:
   - **URL**: `https://2ch.example.com` (SITE_URL に設定したもの)
   - **板タイプ**: 2ch 互換

接続後、板一覧から板を選択してスレッド一覧が表示されれば成功。

---

## KV Namespace

| binding | 必須 | 説明 |
|---|---|---|
| `SESSION_KV` | ✅ (ENABLE_TURNSTILE=true 時) | edge-token 保存先 KV。hono-bbs 本体と **同じ** KV を使っても問題ない (キープレフィックス `edge_token:` で区別される) |

`wrangler.jsonc` に追加:
```jsonc
"kv_namespaces": [
  {
    "binding": "SESSION_KV",
    "id": "<SAME_KV_ID_AS_HONO_BBS>"
  }
]
```

---

## 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `SITE_URL` | | `Host` ヘッダーから自動生成 | bbsmenu のリンク生成に使用。末尾スラッシュは自動除去される |
| `BBS_NAME` | | `掲示板` | bbsmenu のタイトルに表示するサイト名 |
| `CORS_ORIGIN` | | `*` | 許可する CORS オリジン (カンマ区切りで複数指定可) |
| `ENABLE_TURNSTILE` | | `false` | `"true"` にすると書き込み時に Turnstile 認証を必須とする |
| `TURNSTILE_FQDN` | | | Turnstile 認証ページの URL。`turnstileApiToken` プラグインのデプロイ先 |
| `KV_PREFIX` | | *(なし)* | KV グローバルプレフィックス。hono-bbs 本体と KV を共有する場合にキー衝突を防ぐ (例: `prod:`) |

---

## トラブルシューティング

### `wrangler.jsonc` が見つからない

```
Error: No config file found
```

`wrangler.example.jsonc` をコピーして `wrangler.jsonc` を作成していることを確認する。

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

### D1 データベースが見つからない

```
Error: D1_ERROR: no such table: boards
```

`database_id` が hono-bbs と同じ値になっているか確認する。

hono-bbs の `wrangler.jsonc` の `d1_databases[].database_id` と一致している必要がある。

### 文字化けする

2ch ブラウザ側の文字コード設定が Shift-JIS になっているか確認する。

レスポンスの `Content-Type` に `charset=Shift_JIS` が含まれていることを `curl -v` で確認する。

### 投稿できない (`ＥＲＲＯＲ` が返る)

- `bbs` フィールドが正しい板 ID か確認する (`boards.id` カラムの値)
- 新規スレッド作成時は `subject` フィールドが必須
- 同一秒内にスレッドを連続作成しようとしている場合は数秒待ってから再試行する

### 差分取得で 416 が返る

ローカルに保存した dat のバイト数がサーバー側より大きい状態（あぼーん等でレスが削除された）。ローカルの dat を削除して全体取得し直す。

### 差分取得で受け取るバイト数がずれる

ローカルに `\r\n` (CRLF) で保存していると1レスにつき1バイト余分になる。LF で保存するか、サーバーから受信した累積バイト数を別途管理する。
