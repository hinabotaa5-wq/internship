# 問い合わせチケット機能 仕様書

担当: ひなた

## 1. 機能概要

ユーザーが自分で作成した間取り（部屋・壁・Wi-Fiルーター配置など）と、事前 Q&A ページでの回答履歴をもとに問い合わせを登録すると、6桁のランダムな「受付番号」（`NIF-XXXXXX`）が発行されます。

ユーザーはこの受付番号を電話・メールでコールセンターに伝えます。コールセンター側スタッフは受付番号を入力するだけで、登録された間取りデータと Q&A 履歴を照会でき、内容を確認しながら適切なアドバイスを提供できます。

このように、ユーザー側（間取り・Q&A作成）とスタッフ側（照会・アドバイス）の間を、データベースと API でつなぐのがこの機能の役割です。

## 2. データベース構造

`src/web/models.py` に定義されている `Ticket` モデル（`tickets` テーブル）です。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| `id` | Integer (PK) | 内部的な主キー |
| `ticket_number` | String(16), unique, index | 受付番号。`NIF-XXXXXX` 形式（`X` は6文字のランダムな英数字）。ユーザー・スタッフ間のやりとりで使う識別子 |
| `room_layout` | JSON | 間取りデータ（だいき担当のデータ構造をそのまま保存） |
| `qa_history` | JSON | Q&A 回答履歴（たいよう担当のデータ構造をそのまま保存） |
| `created_at` | DateTime | 受付日時（DB側で自動設定される） |

`room_layout` と `qa_history` はどちらも `nullable=False` で、登録時に両方とも必須です。

### 受付番号のルール

- 形式: `NIF-` + 6文字（`_TICKET_NUMBER_ALPHABET` = `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`）
- 電話で聞き取る際に見間違いやすい文字（`0`/`O`、`1`/`I`/`L`）は除外している
- `secrets.choice` を使い推測されにくい値を生成している
- 生成した番号が既存レコードと衝突した場合（`IntegrityError`）は、最大10回まで自動的に再生成してリトライする（`src/web/tickets.py` の `_MAX_GENERATE_ATTEMPTS`）

### マイグレーション

`migrations/versions/c1c0212c2102_add_ticket_model.py` で `tickets` テーブルを追加済み。他のメンバーは `git pull` 後に以下を実行すればローカルDBに反映されます。

```
.venv/bin/flask db upgrade
```

> [!Important]
> データベースのモデルを同時に編集するとマイグレーションのコンフリクトが起きやすいです（`docs/how_to_edit_models.md` 参照）。`Ticket` モデルに変更が必要な場合は、先にひなたに声をかけてください。

## 3. API エンドポイント仕様

`src/web/tickets.py` の `TICKETS_BP`（`url_prefix="/api/tickets"`）で定義。`APP_BP` に登録されているため、実際のパスは環境によって `TEAM_NAME` のプレフィックスが付く場合があります（`url_for()` を使えば自動的に解決されます）。

### POST /api/tickets

問い合わせを新規登録し、受付番号を発行する。ログイン不要。

**リクエスト例**

```json
{
  "room_layout": {
    "walls": [[0, 0], [10, 0], [10, 10], [0, 10]],
    "router": { "x": 5, "y": 5 }
  },
  "qa_history": [
    { "q": "ルーターの電波が弱い", "a": "金属家具から離してください" }
  ]
}
```

- `room_layout`、`qa_history` はどちらも必須。片方でも欠けている場合は `400 Bad Request`（`description: "room_layout と qa_history は必須です"`）を返す
- 内部の構造は特に制限していない（JSON型カラムに保存するため、フロント担当側の都合に合わせて自由な構造を入れてよい）

**レスポンス例（201 Created）**

```json
{
  "ticket_number": "NIF-4F7K2Q"
}
```

- 受付番号の生成に失敗し続けた場合（衝突が10回続いた場合）は `500 Internal Server Error` を返す

### GET /api/tickets/&lt;ticket_number&gt;

受付番号を指定して、登録済みの間取り・Q&A履歴を取得する。ログイン不要。コールセンター側スタッフが使う想定。

**リクエスト例**

```
GET /api/tickets/NIF-4F7K2Q
```

**レスポンス例（200 OK）**

```json
{
  "ticket_number": "NIF-4F7K2Q",
  "room_layout": {
    "walls": [[0, 0], [10, 0], [10, 10], [0, 10]],
    "router": { "x": 5, "y": 5 }
  },
  "qa_history": [
    { "q": "ルーターの電波が弱い", "a": "金属家具から離してください" }
  ],
  "created_at": "2026-08-04T12:34:56.789012"
}
```

- `created_at` は ISO 8601 形式の文字列（`datetime.isoformat()`）
- 該当する受付番号が存在しない場合は `404 Not Found`（`description: "指定された受付番号が見つかりません"`）を返す

## 4. 画面・ルート仕様

`src/web/routes.py` に定義。どちらもログイン不要。

### GET /test-ticket

- テンプレート: `src/web/templates/test_ticket.html`
- ユーザー側の動作確認用ページ
- 「ダミーデータを送信」ボタンで `POST /api/tickets` を呼び出し、発行された受付番号を表示する
- 受付番号を入力して「取得」ボタンを押すと `GET /api/tickets/<ticket_number>` を呼び出し、取得結果を JSON 整形して表示する
- 登録直後は、発行された受付番号が照会欄に自動入力される

### GET /staff/tickets

- テンプレート: `src/web/templates/staff_ticket.html`
- コールセンター側スタッフ向けの照会ページ
- 受付番号を入力し「照会する」ボタン（または Enter キー）を押すと `GET /api/tickets/<ticket_number>` を呼び出す
- 受付番号・受付日時のほか、`room_layout` と `qa_history` をそれぞれ見出し付きで JSON 整形表示する

> [!Note]
> 現時点では `room_layout` / `qa_history` はそのまま JSON テキストとして表示しているだけの仮実装です。だいき担当の間取り描画コンポーネント（レイアウト表示・ヒートマップ）が確定したら、`staff_ticket.html` 内の `renderTicket()` 関数のうち JSON 表示部分を、実際のコンポーネント呼び出しに差し替える想定です。API のレスポンス形式（`room_layout` の中身）自体は変更不要です。

## 5. フロント担当者へのデータ連携ガイド

`room_layout`・`qa_history` は DB 上では JSON 型カラムで保存しているため、**内部構造に制約はありません**。だいき担当・たいよう担当それぞれが扱いやすい形のオブジェクト（配列・ネストしたオブジェクトなど何でも可）をそのまま渡してください。

### 渡し方

- `POST /api/tickets` を呼ぶ際、リクエストボディの `room_layout` に間取りデータ一式、`qa_history` に Q&A 履歴一式を JSON としてそのまま含めてください
- サーバー側でのバリデーションは「値が存在するかどうか（`None` でないか）」のみで、構造の中身はチェックしていません
- 保存したデータは `GET /api/tickets/<ticket_number>` で完全に同じ構造のまま返却されます（サーバー側で加工・変換は行いません）

### 現状の暫定データ例

`test_ticket.html` の `DUMMY_TICKET` で使っているダミーデータ（あくまで動作確認用の一例で、実際の構造はだいき・たいよう担当と相談して決めてください）。

```json
{
  "room_layout": {
    "walls": [[0, 0], [10, 0], [10, 10], [0, 10]],
    "router": { "x": 5, "y": 5 }
  },
  "qa_history": [
    { "q": "ルーターの電波が弱い", "a": "金属家具から離してください" }
  ]
}
```

### 未確定事項（要相談）

- だいき担当: `room_layout` の実際のデータ構造（部屋・壁・ルーター・中継機などのキー名や形式）
- たいよう担当: `qa_history` の実際のデータ構造（質問・回答の形式、選択肢の有無など）
- ヒートマップ計算担当: 計算結果を `room_layout` に含めて保存するか、照会時にスタッフ側で再計算するか
