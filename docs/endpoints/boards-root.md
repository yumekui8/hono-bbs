# [廃止] エンドポイント: `/boards/root`

> **このエンドポイントは廃止されました。**
>
> 板作成権限は環境変数 `ENDPOINT_PERMISSIONS` で管理します。
> 詳細は [README.md](./README.md) の「ENDPOINT_PERMISSIONS の形式」を参照してください。
>
> デフォルトでは `bbs-admin-group` メンバーのみ板を作成できます。
> `GET /boards` のレスポンスに含まれる `endpoint` フィールドで権限情報を参照できます。
