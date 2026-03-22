# エンドポイント: アップロード (`/upload`)

画像の Presigned PUT URL 発行とアップロード完了確認を行う。

---

## フロー

```
1. POST /upload/request   → { imageId, uploadUrl, uploadUrlExpiresAt, contentType }
2. PUT  <uploadUrl>       → ストレージへ直接アップロード (Worker を経由しない)
3. POST /upload/confirm/:imageId → { image, url }
```

---

## `POST /upload/request`

Presigned PUT URL を発行する。クライアントはこの URL を使ってストレージへ直接アップロードする。

### 認証

- `X-Turnstile-Session` — `ENABLE_TURNSTILE=true` のとき必須。SESSION_KV で有効性を検証する

### レート制限

`UPLOAD_RATE_LIMIT` / `UPLOAD_RATE_WINDOW` で設定した制限を超えた場合は `429` を返す。

識別子: `ENABLE_TURNSTILE=true` のとき Turnstile セッション ID、無効のとき `CF-Connecting-IP` ヘッダーの値。

### リクエスト

```json
{
  "type": "object",
  "required": ["contentType"],
  "properties": {
    "contentType": {
      "type": "string",
      "description": "アップロードするファイルの MIME タイプ。ALLOWED_CONTENT_TYPES で許可されたもののみ受け付ける",
      "example": "image/jpeg"
    },
    "filename": {
      "type": "string",
      "description": "元のファイル名 (省略可、メタデータとして保存するのみ)"
    },
    "size": {
      "type": "integer",
      "description": "ファイルサイズ (バイト単位、省略可)。MAX_IMAGE_SIZE が設定されている場合の上限チェックに使用"
    }
  }
}
```

### レスポンス

- `201 Created`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "imageId": {
          "type": "string",
          "format": "uuid",
          "description": "画像を一意に識別する ID。confirm・attach・report 等で使用する"
        },
        "uploadUrl": {
          "type": "string",
          "format": "uri",
          "description": "Presigned PUT URL。有効期限内に直接 PUT リクエストを送ること"
        },
        "uploadUrlExpiresAt": {
          "type": "string",
          "format": "date-time",
          "description": "Presigned URL の有効期限 (PRESIGNED_URL_TTL 秒後)"
        },
        "contentType": {
          "type": "string",
          "description": "アップロード時に使用しなければならない Content-Type。リクエストで指定した値と同じ"
        }
      }
    }
  }
}
```

### ストレージへのアップロード方法

```
PUT <uploadUrl>
Content-Type: <contentType>  ← 署名済みのため必須・完全一致が必要

<バイナリデータ>
```

`Content-Type` ヘッダーは Presigned URL の署名に含まれており、値が一致しない場合ストレージ側で `SignatureDoesNotMatch` エラーが返る。

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `TURNSTILE_REQUIRED` | 400 | `X-Turnstile-Session` ヘッダーがない |
| `TURNSTILE_INVALID` | 400 | Turnstile セッションが無効または期限切れ |
| `VALIDATION_ERROR` | 400 | `contentType` が未指定、または JSON が不正 |
| `INVALID_CONTENT_TYPE` | 400 | 許可されていない MIME タイプ |
| `FILE_TOO_LARGE` | 400 | `size` が `MAX_IMAGE_SIZE` を超えた |
| `CONFIG_ERROR` | 500 | `ENABLE_TURNSTILE=true` だが `SESSION_KV` が未設定 |
| `RATE_LIMIT_EXCEEDED` | 429 | アップロード回数がレート制限を超えた |

---

## `POST /upload/confirm/:imageId`

ストレージへのアップロード完了を Worker に通知し、画像のステータスを `pending` → `active` に遷移させる。

> **注意**: Worker はストレージのオブジェクト存在を直接確認しない。クライアントがアップロードを完了せずに confirm を呼んだ場合、`active` レコードが作成されるが実体が存在しない状態になる。

### 認証

不要

### パスパラメータ

| パラメータ | 説明 |
|---|---|
| `imageId` | `POST /upload/request` で取得した画像 ID |

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "image": { "$ref": "#/Image" },
        "url": {
          "type": "string",
          "format": "uri",
          "description": "画像の公開 URL (IMAGE_PUBLIC_BASE_URL + storageKey)"
        }
      }
    }
  }
}
```

すでに `active` の場合は冪等に `200` を返す。

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `NOT_FOUND` | 404 | 画像が存在しない |
| `INVALID_STATUS` | 409 | ステータスが `pending` でも `active` でもない (`reported` / `deleted` 等) |
