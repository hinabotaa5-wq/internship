# Wi-Fi 診断アプリ

Wi-Fi 接続問題を解決するための診断 Web アプリケーションです。ユーザーは質問に答えることで原因を特定し、住宅レイアウトを作成してルーター配置をシミュレーションし、ヒートマップで電波状況を可視化できます。

# 概要

Flask + Bootstrap + MySQL を使用した Web アプリケーションです。以下の機能を提供しています：

- **原因切り分け診断**: 質問形式で Wi-Fi トラブルの原因を特定
- **住宅レイアウト作成**: 部屋の形状とルーター位置を視覚的に配置
- **ヒートマップ表示**: Wi-Fi 電波強度を可視化し、改善提案を提供
- **問い合わせ受付**: 診断結果と間取りデータを含めた問い合わせチケット発行
- **ユーザー認証**: ログイン機能によるユーザー管理

## フォルダ構成

```
.
├── migrations/          # データベースマイグレーションファイル
├── src/
│   ├── web/
│   │   ├── auth/       # 認証関連のモジュール
│   │   ├── diagnosis/  # 原因切り分け診断機能
│   │   ├── floorplan/  # 住宅レイアウト・ルーター配置機能
│   │   ├── heatmap/    # ヒートマップ表示機能
│   │   ├── wifi/       # Wi-Fi 診断メイン画面
│   │   ├── templates/  # HTMLテンプレート
│   │   ├── static/     # CSS・JS・画像ファイル
│   │   ├── app.py      # アプリケーションファクトリ
│   │   ├── config.py   # 設定ファイル
│   │   ├── models.py   # データベースモデル
│   │   └── routes.py   # ルーティング
├── pyproject.toml       # プロジェクト設定ファイル
└── README.md
```

## 技術スタック

- バックエンド & フロントエンド
  - Python 3.12
  - [Flask 3](https://flask.palletsprojects.com/en/3.0.x/)
  - [Bootstrap 5](https://getbootstrap.com/)
- データベース
  - Flask-SQLAlchemy + Flask-Migrate + MySQL
- パッケージ管理
  - [uv](https://docs.astral.sh/uv/)

## 開発環境の準備方法

このプロジェクトは Visual Studio Code の Dev Container に対応しており、VS Code で開くだけで自動的に環境構築が完了します。基本的に準備していただくものは [Visual Studio Code](https://code.visualstudio.com/) のみで大丈夫です。

1. VS Code に [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) 拡張機能をインストールします。
1. プロジェクトフォルダを VS Code で開きます。
1. 左下の `><` ボタンを押し、現れたメニューから "コンテナで再度開く" (または "Reopen in Container") を選択します。
   - VS Code が Dev Containers を自動的に構築しますが、これには数分かかる場合があります。
1. VS Code の準備ができたら <http://localhost:18347/> にアクセスできるか確認してください。

> [!Note]
>
> VS Code で Python のコードを開いたときに import に大量の赤線が現れる場合はインタプリタを指定してあげる必要があります。VS Code の右下にあるバージョン表示のボタンをクリックし、`.venv/bin/python` が含まれているものを選んでください。

## 主な機能

### 原因切り分け診断
ユーザーが Wi-Fi トラブルに関する質問に答えることで、問題の原因を特定します。質問フローは動的に管理され、ユーザーの回答に基づいて次の質問が表示されます。

### 住宅レイアウト作成
ユーザーは部屋の形状をドラッグ＆ドロップで作成し、ルーターの配置位置を設定できます。レイアウトデータは JSON 形式で保存され、ヒートマップ生成に使用されます。

### ヒートマップ表示
住宅レイアウトとルーター位置に基づいて、Wi-Fi 電波強度のヒートマップを生成します。電波が弱いエリアを視覚的に確認し、ルーター配置の改善提案を提供します。

### 問い合わせ受付
診断結果と間取りデータを含めた問い合わせチケットを発行します。スタッフ側はチケット番号で問い合わせ内容を確認できます。

## データベース設計

### Ticket モデル
問い合わせデータを管理します。以下の情報を保存します：
- `ticket_number`: ユニークな問い合わせ番号
- `room_layout`: 住宅レイアウトデータ（JSON）
- `qa_history`: Q&A 回答履歴（JSON）
- `diagnosis_result`: 原因切り分け診断の結果（JSON、任意）
- `created_at`: 作成日時

## 依存関係の追加

1. `pyproject.toml` の `dependencies`（開発用ツールなら `[dependency-groups]` の `dev`）にパッケージ名を追記します。

2. 以下のコマンドを実行してロックファイルを更新します：

   ```bash
   uv pip compile pyproject.toml -o requirements.lock
   uv pip compile pyproject.toml --group dev -o requirements-dev.lock
   ```

3. 新しい依存関係をインストールします：

   ```bash
   uv pip sync --python .venv/bin/python requirements-dev.lock
   ```

## アプリケーション起動

開発環境では、コードの編集時に自動的に再起動されます。手動で起動する場合は以下のコマンドを使用してください。

```bash
python -m src.web.app
```

アプリケーションは <http://localhost:18347/> でアクセスできます。