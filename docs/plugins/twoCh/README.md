# twoCh プラグイン 仕様書

hono-bbs に 2ch 専用ブラウザ互換の読み書きインターフェースを追加する Cloudflare Worker。

---

## 目次

- [概要](#概要)
- [エンドポイント仕様](#エンドポイント仕様)
- [データフォーマット](#データフォーマット)
- [スレッドキー仕様](#スレッドキー仕様)
- [ユーザー ID 生成](#ユーザー-id-生成)
- [文字コード処理](#文字コード処理)
- [エラーレスポンス](#エラーレスポンス)
- [デプロイ手順](./deploy.md)
- [環境変数](./deploy.md#環境変数)

---

## 概要

このプラグインは hono-bbs 本体とは **別ドメイン** で動作し、D1 データベースを共有する。

```
[2ch ブラウザ]
  │
  ├─ GET /bbsmenu.html          → 板一覧
  ├─ GET /{board}/subject.txt   → スレッド一覧
  ├─ GET /{board}/dat/{key}.dat → スレッド本文 (差分取得対応)
  └─ POST /test/bbs.cgi         → 書き込み

[twoCh Worker] ──── D1 (共有) ──── [hono-bbs Worker]
```

### 認証について

2ch 専用ブラウザはログイン機能・Turnstile に対応しないため、このプラグインは **認証なし・匿名投稿のみ** で動作する。

---

## エンドポイント仕様

### GET /bbsmenu.html

板一覧を 2ch 互換 HTML で返す。

**レスポンス**

- Content-Type: `text/html; charset=Shift_JIS`
- 文字コード: Shift-JIS

**HTML 構造**

```html
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">
<title>{BBS_NAME}</title>
</head>
<body>
<BR><B>{カテゴリ名}</B><BR>
<A HREF={SITE_URL}/{board_id}/>{板名}</A><BR>
...
</body>
</html>
```

- `href` 属性はクォートなし (`<A HREF=...>`) ← 2ch ブラウザの仕様に合わせた形式
- 板は `category` カラムでグループ化される。`category` が NULL の板は「その他」に分類される
- 板の並び順は `created_at` 昇順

---

### GET /{board}/subject.txt

指定した板のスレッド一覧を返す。

**パラメーター**

| パラメーター | 説明 |
|---|---|
| `board` | 板 ID (boards.id) |

**レスポンス**

- Content-Type: `text/plain; charset=Shift_JIS`
- 文字コード: Shift-JIS
- 改行: `\n` (LF)

**フォーマット（1行 = 1スレッド）**

```
{thread_key}.dat<>{title} ({post_count})
```

例:
```
1742601146.dat<>テストスレッド (5)
1742598000.dat<>雑談スレ (123)
```

**並び順**

`updated_at` 降順（最新レスのあるスレッドが上位）

**衝突解決**

同一 UNIX 秒に複数スレッドが存在する場合、`created_at` が最古のスレッドのみ表示する。

---

### GET /{board}/dat/{file}

スレッドの全投稿を dat 形式で返す。差分取得 (Range) に対応。

**パラメーター**

| パラメーター | 説明 |
|---|---|
| `board` | 板 ID |
| `file` | スレッドキー + `.dat` (例: `1742601146.dat`) |

**リクエストヘッダー（省略可）**

| ヘッダー | 説明 |
|---|---|
| `If-Modified-Since` | 前回取得時の `Last-Modified` 値。RFC1123 形式 |
| `Range` | 差分取得の開始バイト位置。形式: `bytes={size}-` |

**レスポンスステータス**

| ステータス | 条件 |
|---|---|
| `200 OK` | Range なし。全データを返す |
| `206 Partial Content` | 新着あり。`Range` で指定した位置以降のデータを返す |
| `304 Not Modified` | `If-Modified-Since` 以降に更新なし |
| `416 Range Not Satisfiable` | ローカルDAT > リモートDAT（あぼーん等） |
| `404 Not Found` | スレッドが存在しない |

**レスポンスヘッダー**

| ヘッダー | 付与されるステータス | 例 |
|---|---|---|
| `Content-Type` | 200 / 206 | `text/plain; charset=Shift_JIS` |
| `Last-Modified` | 200 / 206 / 304 / 416 | `Sun, 22 Mar 2026 00:12:26 GMT` (RFC1123) |
| `Accept-Ranges` | 200 / 206 | `bytes` |
| `Content-Range` | 206 | `bytes 1234-5678/5679` |
| `Content-Range` | 416 | `bytes */5678` |
| `Content-Length` | 200 / 206 | レスポンスボディのバイト数 |

**フォーマット（1行 = 1レス）**

```
名前<>メール<>日付 ID<>本文<>スレタイトル（1行目のみ）
```

- **名前**: `poster_name`。空の場合は `名無し`
- **メール**: `poster_sub_info`。`sage` 等
- **日付**: JST 変換済み、形式 `YYYY/MM/DD(曜) HH:MM:SS.mmm`
- **ID**: ` ID:{display_user_id}` の形式で日付の後ろに付与。`display_user_id` が空の場合は省略
- **本文**: `\n` → `<br>`、HTML エンティティ変換済み（後述）
- **スレタイトル**: 1行目 (最初のレス) のみ設定。2行目以降は空文字

**差分取得の処理フロー**

```
リクエスト受信
  │
  ├─ If-Modified-Since あり かつ Last-Modified <= If-Modified-Since
  │    └─ 304 (投稿クエリなしで即返却)
  │
  ├─ Range なし → 200 (全体)
  │
  └─ Range: bytes={start}-
       ├─ start >= 全体バイト数 → 416 (あぼーん検出)
       └─ start <  全体バイト数 → 206 (start バイト目以降)
```

**注意: 改行コードとバイト数**

dat の改行は `\n` (LF, 1バイト)。クライアントがローカルに `\r\n` (CRLF) で保存すると1レスにつき1バイト余分になり、`Range` オフセットがずれる。クライアント側は必ず LF で保存するか、サーバーから受信した累積バイト数を別途管理する必要がある。

**衝突解決**

同一 UNIX 秒に複数スレッドが存在する場合、`created_at` が最古のスレッドを返す。

**404 条件**

- スレッドキーが数値でない
- 該当スレッドが存在しない

---

### POST /test/bbs.cgi

スレッド作成またはレス投稿を行う。

**リクエスト**

- Content-Type: `application/x-www-form-urlencoded`
- 文字コード: Shift-JIS
- URL: `/test/bbs.cgi` または `/test/bbs.cgi?guid=ON` (クエリパラメーターは無視される)

**フォームフィールド**

| フィールド | 必須 | 説明 |
|---|---|---|
| `bbs` | ✅ | 板 ID |
| `key` | | スレッドキー。空または省略または `0` = 新規スレッド作成 |
| `subject` | ✅ (新規スレッド時) | スレッドタイトル |
| `FROM` | | 投稿者名。省略時は板の `default_poster_name` を使用 |
| `mail` | | メール欄 (`sage` 等)。`ENABLE_TURNSTILE=true` 時は Turnstile トークンも受け付ける（後述）|
| `MESSAGE` | ✅ | 本文 |

**新規スレッド作成の判定**

`key` フィールドが **存在しない・空文字列・`"0"` いずれか**の場合に新規スレッドとして扱う。

**Turnstile 認証 (`ENABLE_TURNSTILE=true` 時)**

書き込みリクエストに以下のいずれかの有効な Turnstile トークンが必要:

1. **Cookie** `turnstile_session=<token>` — Web ブラウザ向け (フロントエンドが設定)
2. **メール欄** `<token>` のみ — 2ch 専用ブラウザ向け (カスタムヘッダーを設定できないため)

Cookie と mail が両方ある場合は Cookie を優先する。mail がトークンとして使用された場合、DB には空文字列で保存される (トークン文字列は mail として記録しない)。

認証失敗時のレスポンス (HTML、Shift-JIS、`<!-- 2ch_X:error -->` コメント付き):
```
書き込む前に認証が必要です。
以下のURLにアクセスして認証を行ってください：{TURNSTILE_FQDN}
認証キーを発行しても書き込みができない場合には、メール欄に認証キーのみを入力して再度書き込みを行ってください。
```

**投稿データの保存**

| DB カラム | 値 |
|---|---|
| `poster_name` | `FROM` フィールド または板の `default_poster_name` |
| `poster_sub_info` | `mail` フィールド (Turnstile トークンとして使用された場合は空文字列) |
| `display_user_id` | 後述のデイリー ID |
| `content` | `MESSAGE` フィールド (UTF-8 で保存) |
| `permissions` | `"10,10,10,8"` (固定) |
| `owner_user_id` | `POST_OWNER_USER` 環境変数 (未設定時 NULL) |
| `owner_group_id` | `POST_OWNER_GROUP` 環境変数 (未設定時 NULL) |

スレッド作成時の追加フィールド:

| DB カラム | 値 |
|---|---|
| `owner_user_id` | `THREAD_OWNER_USER` 環境変数 (未設定時 NULL) |
| `owner_group_id` | `THREAD_OWNER_GROUP` 環境変数 (未設定時 NULL) |

**レスポンス**

- Content-Type: `text/html; charset=x-sjis`
- 文字コード: Shift-JIS

成功時 (`<!-- 2ch_X:true -->` コメント付き — 専用ブラウザがスレッド位置を維持するために使用):
```html
<html><!-- 2ch_X:true --><head>...<title>書きこみました。</title></head>
<body>書きこみました。</body></html>
```

失敗時 (`<!-- 2ch_X:error -->` コメント付き):
```html
<html><!-- 2ch_X:error --><head>...<title>ＥＲＲＯＲ</title></head>
<body>{エラーメッセージ}<br></body></html>
```

---

## データフォーマット

### 日付フォーマット

DB に保存されている UTC の ISO 8601 形式を JST (UTC+9) に変換して出力する。

| 形式 | 例 |
|---|---|
| DB 保存値 | `2026-03-22T00:12:26.257Z` |
| dat 出力値 | `2026/03/22(日) 09:12:26.257` |

曜日は日本語 (`日月火水木金土`)。ミリ秒は3桁。

`Last-Modified` ヘッダーは RFC1123 形式 (`Date.prototype.toUTCString()`)。例: `Sun, 22 Mar 2026 00:12:26 GMT`

### 本文エンコード (dat 出力時)

DB に保存されている内容を dat 形式に変換する際、以下の変換を行う。

| 変換前 | 変換後 |
|---|---|
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| `\n` (改行) | `<br>` |

### 本文デコード (POST 受信時)

2ch ブラウザから受信した本文はそのまま UTF-8 に変換して DB へ保存する。HTML エンティティの変換は行わない。

---

## スレッドキー仕様

2ch ブラウザはスレッドを **UNIX 時間（10桁整数、秒単位）** で識別する。

このプラグインでは `CAST(strftime('%s', created_at) AS INTEGER)` の値をスレッドキーとして使用する。

### 衝突時の挙動

同一秒内に複数スレッドが作成された場合:

| 操作 | 挙動 |
|---|---|
| `subject.txt` 取得 | `created_at` が最古のスレッドのみ表示 |
| `dat` 取得 | `created_at` が最古のスレッドのみ返す |
| スレッド作成 | 同一秒に既存スレッドがあれば拒否してエラーを返す |

---

## ユーザー ID 生成

投稿者の ID は以下の方法で生成する。

```
seed = "{IP アドレス}:{YYYY-MM-DD}"
hash = SHA-256(seed)
id   = base64(hash の先頭 7 バイト)  // "+" を "." に置換、末尾 "=" 除去、先頭 9 文字
```

- IP アドレスは `CF-Connecting-IP` ヘッダーを優先し、次に `X-Real-IP` を使用
- 日付は UTC での `YYYY-MM-DD` 形式
- 同一 IP は同日内に常に同じ ID が付与される
- 翌日 (UTC) になると ID が変わる

---

## 文字コード処理

### 出力 (Shift-JIS エンコード)

Cloudflare Workers の `TextEncoder` は UTF-8 のみサポートするため、`encoding-japanese` ライブラリを使用する。

Shift-JIS で表現できない文字（一部の絵文字など）は `?` に変換される。

### 入力 (Shift-JIS デコード)

2ch ブラウザが送信する `application/x-www-form-urlencoded` のボディは Shift-JIS でエンコードされている。

デコード手順:
1. ボディを `latin1` として文字列に変換（バイト値を保持するため）
2. `&` でフィールドに分割
3. 各フィールド値を1バイトずつ処理
   - `%XX` → 16進数デコードしてバイトに追加
   - `+` → スペース (0x20) として追加
   - その他 → `charCodeAt(0)` をバイトとして追加（ASCII文字は URL エンコードされない場合がある）
4. バイト列を `TextDecoder('shift_jis')` でデコード

---

## エラーレスポンス

`POST /test/bbs.cgi` のエラー一覧:

| 条件 | エラーメッセージ |
|---|---|
| `bbs` または `MESSAGE` が空 | `入力が不正です` |
| 指定した板が存在しない | `指定された板が存在しません` |
| 新規スレッドで `subject` が空 | `スレッドタイトルを入力してください` |
| 同一秒内に既存スレッドあり | `同一秒内にスレッドが既に存在します。時間をおいてから再試行してください` |
| スレッドキーが数値でない | `スレッドキーが不正です` |
| 指定したスレッドが存在しない | `指定されたスレッドが存在しません` |

サーバー内部エラーの場合は HTTP 500 `Internal Server Error` を返す（HTML なし）。

---

## 注意事項

- **認証なし**: 2ch ブラウザはログイン機能を持たないため、投稿は匿名扱い
- **Turnstile なし**: このプラグインは Turnstile をバイパスする
- **読み取り専用権限**: 板の権限設定に関わらず匿名投稿が可能
- **完全互換ではない**: `/test/read.cgi` 等の一部エンドポイントは非実装
- Shift-JIS で表現できない文字は `?` に変換される
