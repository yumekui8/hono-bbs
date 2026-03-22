# エンドポイント: 画像操作 (`/images/:imageId`)

画像メタデータの取得・通報・削除を行う。

---

## `GET /images/:imageId`

画像のメタデータと公開 URL を取得する。

### 認証

不要

### パスパラメータ

| パラメータ | 説明 |
|---|---|
| `imageId` | 画像 ID |

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

`status` が `reported` の画像も取得できる。削除済み（DB から行が消えた状態）および存在しない画像は `404` を返す。

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `NOT_FOUND` | 404 | 画像が存在しない、または削除済み |

---

## `POST /images/:imageId/report`

画像を通報する。`active` または `reported` 状態の画像のみ対象。

- `report_count` をインクリメントする
- `active` の場合は `reported` にステータス遷移する
- `reported` の場合はステータスをそのまま維持しカウントのみ増加する

通報された画像は `DELETE /images/:imageId/:deleteToken`（投稿者）または `DELETE /images/:imageId`（管理者）で削除されるまで引き続き公開される。

### 認証

不要

### パスパラメータ

| パラメータ | 説明 |
|---|---|
| `imageId` | 通報する画像 ID |

### リクエスト

ボディ不要

### レスポンス

- `200 OK`

```json
{
  "data": { "message": "Image reported" }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `NOT_FOUND` | 404 | 画像が存在しない、削除済み、または `pending` 状態 |

---

## `DELETE /images/:imageId/:deleteToken`

アップロード時に発行された `deleteToken` を使って投稿者自身が画像を削除する。認証不要で、トークンを知っている人のみ削除できる。

ストレージ上のオブジェクトと D1 の行を両方削除する。

### 認証

不要（`deleteToken` が認証代わり）

### パスパラメータ

| パラメータ | 説明 |
|---|---|
| `imageId` | 削除する画像 ID |
| `deleteToken` | `POST /upload/request` のレスポンスで受け取ったトークン |

### レスポンス

- `204 No Content`

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `NOT_FOUND` | 404 | 画像が存在しない、削除済み、またはトークンが不正 |
| `STORAGE_ERROR` | 500 | ストレージからの削除に失敗 |

ストレージ削除が失敗した場合は `500` を返し、D1 の行は削除されない。

---

## `DELETE /images/:imageId`

管理者が画像を削除する。ストレージ上のオブジェクトと D1 の行を両方削除する。

### 認証

- `Authorization: Bearer <ADMIN_API_KEY>` 必須

### パスパラメータ

| パラメータ | 説明 |
|---|---|
| `imageId` | 削除する画像 ID |

### レスポンス

- `204 No Content`

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `UNAUTHORIZED` | 401 | `Authorization` ヘッダーが不正または未指定 |
| `FORBIDDEN` | 403 | `ADMIN_API_KEY` が未設定 (管理者機能が無効) |
| `NOT_FOUND` | 404 | 画像が存在しない、または削除済み |
| `STORAGE_ERROR` | 500 | ストレージからの削除に失敗 |

ストレージ削除が失敗した場合は `500` を返し、D1 の行は削除されない。
